"use client";

import { useState } from "react";
import { SchoolMap, type MapSchoolPoint } from "./SchoolMap";
import { SchoolCard } from "./SchoolCard";
import { LoadingState, ErrorState, EmptyState, UnavailableDataState } from "./StatusStates";
import type { Database, DesignationStatus } from "@/types/database";

type SchoolRow = Database["public"]["Tables"]["schools"]["Row"] & {
  school_authorities?: { name: string; authority_type: string } | null;
  school_programs?: { program_name: string; program_code: string | null }[];
};

interface Designation {
  authority_id: string;
  school_id: string | null;
  status: DesignationStatus;
  boundary_version_id: string;
  source_id: string | null;
}

interface SearchResponseOk {
  status: "ok";
  resolvedAddress: string;
  coordinates: { lat: number; lon: number };
  geocodeAccuracy: string;
  designations: Designation[];
  schools: SchoolRow[];
  nearbyStops: { stop_name: string; distance_m: number; feed_name: string }[];
  nearbyStopsError: string | null;
}

type SearchResponse =
  | SearchResponseOk
  | { status: "no_results" }
  | { status: "ambiguous"; candidates: { formattedAddress: string }[] }
  | { status: "out_of_scope"; resolvedAddress: string; city: string | null; message: string }
  | { status: "geocoding_unavailable"; message?: string }
  | { status: "provider_error"; message: string }
  | { status: "error"; message: string };

export function SearchExperience({ includeDemo = false }: { includeDemo?: boolean }) {
  const [address, setAddress] = useState("");
  const [schoolYear, setSchoolYear] = useState("2025-26");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function downloadPdf() {
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, schoolYear, includeDemo }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "PDF generation failed." }));
        setPdfError(body.error ?? "PDF generation failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "schoolfinder-report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("Could not reach the PDF service. Check your connection and try again.");
    } finally {
      setPdfLoading(false);
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, schoolYear, includeDemo }),
      });
      const data = (await res.json()) as SearchResponse;
      if (!res.ok && data.status !== "ambiguous" && data.status !== "no_results") {
        setError("message" in data && data.message ? data.message : "Search failed.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Could not reach the search service. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const mapSchools: MapSchoolPoint[] =
    result && result.status === "ok"
      ? result.schools
          .filter((s) => s.latitude != null && s.longitude != null)
          .map((s) => {
            const designation = result.designations.find((d) => d.school_id === s.id);
            return {
              id: s.id,
              name: s.name,
              latitude: s.latitude as number,
              longitude: s.longitude as number,
              designated: designation?.status === "designated",
            };
          })
      : [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <form onSubmit={runSearch} className="flex flex-col gap-3" aria-label="Address search">
          <label className="text-sm font-medium text-slate-700" htmlFor="address">
            Home address
          </label>
          <input
            id="address"
            type="text"
            required
            minLength={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 123 Example St NW, Calgary, AB"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="text-sm font-medium text-slate-700" htmlFor="schoolYear">
            School year
          </label>
          <input
            id="schoolYear"
            type="text"
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            pattern="\d{4}-\d{2}"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Search
          </button>
        </form>

        <div className="mt-4">
          {loading && <LoadingState />}
          {error && <ErrorState message={error} onRetry={() => setError(null)} />}
          {!loading && !error && result?.status === "no_results" && (
            <EmptyState message="No address matched what you entered. Check the spelling, or try including the postal code." />
          )}
          {!loading && !error && result?.status === "ambiguous" && (
            <UnavailableDataState message="That address matched more than one location. Try adding a unit number, postal code, or more of the street name." />
          )}
          {!loading && !error && result?.status === "out_of_scope" && (
            <UnavailableDataState message={result.message} />
          )}
          {!loading && !error && result?.status === "geocoding_unavailable" && (
            <UnavailableDataState message="Address search is not configured on this deployment yet." />
          )}
          {!loading && !error && result?.status === "provider_error" && (
            <ErrorState message={`The geocoding provider could not be reached: ${result.message}`} />
          )}

          {!loading && !error && result?.status === "ok" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Resolved to <strong>{result.resolvedAddress}</strong> (
                  {result.geocodeAccuracy} accuracy)
                </p>
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={pdfLoading}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {pdfLoading ? "Preparing PDF..." : "Download PDF report"}
                </button>
              </div>
              {pdfError && <p className="text-xs text-red-700">{pdfError}</p>}
              {result.schools.length === 0 ? (
                <UnavailableDataState message="No designation data is available for this location and school year yet." />
              ) : (
                result.schools.map((s) => {
                  const d = result.designations.find((x) => x.school_id === s.id);
                  return (
                    <SchoolCard key={s.id} school={s} designationStatus={d?.status ?? null} />
                  );
                })
              )}
              {result.nearbyStopsError && (
                <UnavailableDataState message={`Transit data unavailable: ${result.nearbyStopsError}`} />
              )}
              {!result.nearbyStopsError && result.nearbyStops.length === 0 && (
                <UnavailableDataState message="No authorized transit stop data is available near this address." />
              )}
              {!result.nearbyStopsError && result.nearbyStops.length > 0 && (
                <div className="rounded-md border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-700">Nearby transit stops</p>
                  <ul className="mt-1 list-disc pl-5">
                    {result.nearbyStops.map((stop, i) => (
                      <li key={i}>
                        {stop.stop_name} &mdash; {(stop.distance_m / 1000).toFixed(2)} km (
                        {stop.feed_name})
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-slate-400">
                    Proximity to a stop is not the same as a valid school-bus route or
                    eligibility -- see the school card above for any authorized eligibility data.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="h-[480px] lg:h-full">
        <SchoolMap
          searchedPoint={result && result.status === "ok" ? result.coordinates : null}
          schools={mapSchools}
        />
      </div>
    </div>
  );
}
