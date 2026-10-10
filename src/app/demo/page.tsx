import Link from "next/link";
import { SearchExperience } from "@/components/SearchExperience";

export default function DemoPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="rounded-md border border-fuchsia-300 bg-fuchsia-50 p-3 text-sm text-fuchsia-900">
        <strong>This is a DEMO.</strong> Every school, address, and boundary shown here is
        fictional and exists only to demonstrate the interface. Nothing here is backed by a real
        data source. For real Calgary/Airdrie data, go to the{" "}
        <Link href="/" className="underline">
          main search page
        </Link>
        .
      </div>
      <h1 className="text-2xl font-bold text-slate-900">SchoolFinder DEMO</h1>
      <p className="text-sm text-slate-600">
        Try searching <code className="rounded bg-slate-100 px-1">123 Example Street</code> to
        see the fictional designated school.
      </p>
      <SearchExperience includeDemo />
    </main>
  );
}
