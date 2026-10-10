// Shared server-side search logic used by both /api/search (JSON for the
// UI) and /api/pdf (a provenance-bearing PDF export). Factored out so the
// PDF can NEVER be built from client-supplied result data -- it re-runs
// this exact lookup itself, so what a user sees on screen and what they
// can export as a PDF are guaranteed to come from the same query against
// current data, never from values a client could tamper with before
// asking for a PDF of them.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DesignationStatus } from "@/types/database";
import { getGeocodingProvider, cityInScope } from "@/lib/geocoding";

type SchoolRow = Database["public"]["Tables"]["schools"]["Row"];
type DataSourceRow = Database["public"]["Tables"]["data_sources"]["Row"];

export interface Designation {
  authority_id: string;
  school_id: string | null;
  status: DesignationStatus;
  boundary_version_id: string;
  source_id: string | null;
}

export interface NearbyStop {
  feed_id: string;
  feed_name: string;
  stop_id: string;
  stop_name: string;
  distance_m: number;
  source_id: string | null;
}

export type SourceRecord = Pick<DataSourceRow, "id" | "name" | "organization" | "last_verified_at">;

export type SearchOutcome =
  | {
      status: "ok";
      resolvedAddress: string;
      coordinates: { lat: number; lon: number };
      geocodeAccuracy: string;
      designations: Designation[];
      schools: (SchoolRow & {
        school_authorities?: { name: string; authority_type: string } | null;
        school_programs: { program_name: string; program_code: string | null }[];
      })[];
      nearbyStops: NearbyStop[];
      nearbyStopsError: string | null;
      /** Keyed by data_sources.id, for every source_id referenced above. */
      sourcesById: Record<string, SourceRecord>;
    }
  | { status: "no_results" }
  | { status: "ambiguous"; candidates: { formattedAddress: string }[] }
  | { status: "out_of_scope"; resolvedAddress: string; city: string | null; message: string }
  | { status: "geocoding_unavailable"; message?: string }
  | { status: "provider_error"; message: string };

export interface SearchInput {
  address: string;
  schoolYear: string;
  programScope?: string | null;
  includeDemo: boolean;
}

export async function runSearch(
  supabase: SupabaseClient<Database>,
  input: SearchInput
): Promise<SearchOutcome> {
  const provider = getGeocodingProvider();
  if (!provider) {
    return {
      status: "geocoding_unavailable",
      message:
        "Address search is not configured yet. An administrator needs to set GEOCODING_PROVIDER and a provider API key.",
    };
  }

  const geocodeResult = await provider.geocode(input.address);

  if (geocodeResult.status === "no_results") return { status: "no_results" };
  if (geocodeResult.status === "ambiguous") {
    return { status: "ambiguous", candidates: geocodeResult.candidates };
  }
  if (geocodeResult.status === "provider_error") {
    return { status: "provider_error", message: geocodeResult.message };
  }
  if (geocodeResult.status === "not_configured") {
    return { status: "geocoding_unavailable" };
  }

  const { candidate } = geocodeResult;

  if (!cityInScope(candidate.city)) {
    return {
      status: "out_of_scope",
      resolvedAddress: candidate.formattedAddress,
      city: candidate.city,
      message:
        "This address was found, but it's outside the cities this tool currently covers (Calgary, Airdrie, Chestermere, Cochrane).",
    };
  }

  const [designationResult, nearbyStopsResult] = await Promise.all([
    supabase.rpc("find_designated_schools", {
      p_lon: candidate.longitude,
      p_lat: candidate.latitude,
      p_school_year: input.schoolYear,
      p_program_scope: input.programScope ?? null,
      p_include_demo: input.includeDemo,
    }),
    supabase.rpc("nearby_stops", {
      p_lon: candidate.longitude,
      p_lat: candidate.latitude,
      p_radius_m: 1200,
      p_include_demo: input.includeDemo,
    }),
  ]);

  if (designationResult.error) {
    throw new Error(designationResult.error.message);
  }

  const designations = designationResult.data ?? [];
  const schoolIds = designations.map((d) => d.school_id).filter((id): id is string => !!id);

  const { data: schoolRows, error: schoolsError } =
    schoolIds.length > 0
      ? await supabase
          .from("schools")
          .select("*, school_authorities(name, authority_type)")
          .in("id", schoolIds)
      : { data: [] as (SchoolRow & { school_authorities: { name: string; authority_type: string } | null })[], error: null };
  if (schoolsError) throw new Error(schoolsError.message);

  const { data: programRows } =
    schoolIds.length > 0
      ? await supabase.from("school_programs").select("school_id, program_name, program_code").in("school_id", schoolIds)
      : { data: [] as { school_id: string; program_name: string; program_code: string | null }[] };

  const programsBySchool = new Map<string, { program_name: string; program_code: string | null }[]>();
  for (const p of programRows ?? []) {
    const list = programsBySchool.get(p.school_id) ?? [];
    list.push({ program_name: p.program_name, program_code: p.program_code });
    programsBySchool.set(p.school_id, list);
  }
  const schools = (schoolRows ?? []).map((s) => ({ ...s, school_programs: programsBySchool.get(s.id) ?? [] }));

  const nearbyStops: NearbyStop[] = nearbyStopsResult.error ? [] : nearbyStopsResult.data ?? [];
  const nearbyStopsError = nearbyStopsResult.error?.message ?? null;

  // Resolve every source_id referenced by schools/designations/stops into
  // a name+organization+verification-date record, for the PDF's
  // provenance footer. Never fabricated: a null source_id (which the DB
  // only allows for is_demo rows) just means no entry here, and the PDF
  // renders that as "source unavailable" rather than inventing one.
  const sourceIds = new Set<string>();
  for (const s of schools) if (s.source_id) sourceIds.add(s.source_id);
  for (const d of designations) if (d.source_id) sourceIds.add(d.source_id);
  for (const st of nearbyStops) if (st.source_id) sourceIds.add(st.source_id);

  const sourcesById: Record<string, SourceRecord> = {};
  if (sourceIds.size > 0) {
    const { data: sourceRows } = await supabase
      .from("data_sources")
      .select("id, name, organization, last_verified_at")
      .in("id", Array.from(sourceIds));
    for (const row of sourceRows ?? []) {
      sourcesById[row.id] = row;
    }
  }

  return {
    status: "ok",
    resolvedAddress: candidate.formattedAddress,
    coordinates: { lat: candidate.latitude, lon: candidate.longitude },
    geocodeAccuracy: candidate.accuracy,
    designations,
    schools,
    nearbyStops,
    nearbyStopsError,
    sourcesById,
  };
}
