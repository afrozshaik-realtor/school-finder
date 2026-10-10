import { NextResponse, type NextRequest } from "next/server";
import { schoolFilterSchema } from "@/lib/validation/search";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = checkRateLimit(`schools:${clientKeyFromHeaders(request.headers)}`);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = schoolFilterSchema.safeParse({
    city: url.searchParams.get("city") ?? undefined,
    schoolType: url.searchParams.get("schoolType") ?? undefined,
    grade: url.searchParams.get("grade") ?? undefined,
    program: url.searchParams.get("program") ?? undefined,
    authorityId: url.searchParams.get("authorityId") ?? undefined,
    includeDemo: url.searchParams.get("includeDemo") === "true",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const filters = parsed.data;

  const supabase = await createClient();
  // The official_schools / demo_schools views make the DEMO/official split
  // structural: there is no WHERE clause here to forget.
  let query = supabase
    .from(filters.includeDemo ? "demo_schools" : "official_schools")
    .select("*, school_authorities(name, authority_type)")
    .order("name");

  if (filters.city) query = query.eq("city", filters.city);
  if (filters.schoolType) query = query.eq("school_type", filters.schoolType);
  if (filters.authorityId) query = query.eq("authority_id", filters.authorityId);

  const { data: schoolRows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Programs are fetched separately and merged in application code rather
  // than via an embedded `school_programs(...)` select. The two convenience
  // views (official_schools/demo_schools) don't carry the view-vs-table
  // "Relationships" metadata PostgREST's generated types need to resolve a
  // reverse (one-to-many) embed from a VIEW -- a known limitation of this
  // hand-written types file (see src/types/database.ts), not of the schema
  // itself. A plain second query avoids the issue entirely and will keep
  // working once real generated types replace this file.
  const schoolIds = (schoolRows ?? []).map((s) => s.id);
  const { data: programRows } =
    schoolIds.length > 0
      ? await supabase
          .from("school_programs")
          .select("school_id, program_name, program_code")
          .in("school_id", schoolIds)
      : { data: [] as { school_id: string; program_name: string; program_code: string | null }[] };

  const programsBySchool = new Map<string, { program_name: string; program_code: string | null }[]>();
  for (const p of programRows ?? []) {
    const list = programsBySchool.get(p.school_id) ?? [];
    list.push({ program_name: p.program_name, program_code: p.program_code });
    programsBySchool.set(p.school_id, list);
  }

  const withPrograms = (schoolRows ?? []).map((s) => ({
    ...s,
    school_programs: programsBySchool.get(s.id) ?? [],
  }));

  // Grade range + program-name filtering happens in application code since
  // grade_min/grade_max are free-form ('K'..'12') and program matching
  // needs the join merged above.
  const gradeOrder = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  const gradeIndex = (g: string) => gradeOrder.indexOf(g);

  let results = withPrograms;
  if (filters.grade) {
    const target = gradeIndex(filters.grade);
    results = results.filter(
      (s) => target >= gradeIndex(s.grade_min) && target <= gradeIndex(s.grade_max)
    );
  }
  if (filters.program) {
    const needle = filters.program.toLowerCase();
    results = results.filter((s) =>
      s.school_programs.some(
        (p) =>
          p.program_name.toLowerCase().includes(needle) ||
          p.program_code?.toLowerCase() === needle
      )
    );
  }

  return NextResponse.json({ status: "ok", schools: results });
}
