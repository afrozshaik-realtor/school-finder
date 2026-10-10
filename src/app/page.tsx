import Link from "next/link";
import { SearchExperience } from "@/components/SearchExperience";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          SchoolFinder: Calgary &amp; Airdrie
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Look up school designation and transportation information by address. This tool
          shows officially documented designation boundaries and authorized transit data where
          available, and says clearly when evidence is unavailable instead of guessing.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/demo" className="text-blue-700 underline">
            Try the DEMO (fictional data, no setup required)
          </Link>
        </p>
      </header>

      <SearchExperience />

      <footer className="mt-auto border-t border-slate-200 pt-4 text-xs text-slate-400">
        Designation results reflect officially published boundary data where available. A
        geographic match is informational and does not itself confirm admission or
        transportation eligibility. See each school card for its data source and verification
        date.
      </footer>
    </main>
  );
}
