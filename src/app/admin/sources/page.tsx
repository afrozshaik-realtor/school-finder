import { redirect } from "next/navigation";
import { createClient, getCurrentUserWithRole } from "@/lib/supabase/server";
import { AdminNav } from "@/components/AdminNav";
import { CreateSourceForm } from "@/components/admin/CreateSourceForm";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect("/admin/login?next=/admin/sources");
  if (role !== "admin" && role !== "editor") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p role="alert" className="text-red-700">
          Your account does not have editor or admin access.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: sources, error } = await supabase
    .from("data_sources")
    .select("*")
    .order("organization")
    .order("name");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminNav current="/admin/sources" />
      <h1 className="text-xl font-bold text-slate-900">Data sources</h1>
      <p className="mt-1 text-sm text-slate-600">
        Every official (non-DEMO) authority, school, program, boundary version, and GTFS feed must
        cite a row here -- this is what the app&apos;s{" "}
        <code className="rounded bg-slate-100 px-1">*_source_required_unless_demo</code> CHECK
        constraints enforce at the database level, and what every school card and PDF report
        prints as provenance.
      </p>

      <div className="mt-6">
        <CreateSourceForm />
      </div>

      {error && <p className="mt-4 text-red-700">{error.message}</p>}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">Name</th>
            <th className="py-2">Organization</th>
            <th className="py-2">License</th>
            <th className="py-2">Last verified</th>
          </tr>
        </thead>
        <tbody>
          {(sources ?? []).map((s) => (
            <tr key={s.id} className="border-b border-slate-100">
              <td className="py-2">
                {s.source_url ? (
                  <a href={s.source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
              </td>
              <td className="py-2">{s.organization}</td>
              <td className="py-2">{s.license ?? "--"}</td>
              <td className="py-2">{s.last_verified_at ?? "--"}</td>
            </tr>
          ))}
          {(sources ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-slate-400">
                No data sources yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
