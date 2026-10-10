import { redirect } from "next/navigation";
import { createClient, getCurrentUserWithRole } from "@/lib/supabase/server";
import { AdminNav } from "@/components/AdminNav";
import { CreateAuthorityForm } from "@/components/admin/CreateAuthorityForm";

export const dynamic = "force-dynamic";

export default async function AuthoritiesPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect("/admin/login?next=/admin/authorities");
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
  const [{ data: authorities, error }, { data: sources }] = await Promise.all([
    supabase
      .from("school_authorities")
      .select("*, data_sources(name, organization)")
      .order("authority_type")
      .order("name"),
    supabase.from("data_sources").select("id, name, organization").order("name"),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminNav current="/admin/authorities" />
      <h1 className="text-xl font-bold text-slate-900">School authorities</h1>
      <p className="mt-1 text-sm text-slate-600">
        Public/Catholic/Private/Charter boards (e.g. Calgary Board of Education, Rocky View
        Schools). Each must cite an existing data source.
      </p>

      <div className="mt-6">
        <CreateAuthorityForm sources={sources ?? []} />
      </div>

      {error && <p className="mt-4 text-red-700">{error.message}</p>}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">Name</th>
            <th className="py-2">Type</th>
            <th className="py-2">Source</th>
            <th className="py-2">Demo</th>
          </tr>
        </thead>
        <tbody>
          {(authorities ?? []).map((a) => (
            <tr key={a.id} className="border-b border-slate-100">
              <td className="py-2">{a.name}</td>
              <td className="py-2 capitalize">{a.authority_type}</td>
              <td className="py-2">{a.data_sources ? `${a.data_sources.name} (${a.data_sources.organization})` : "--"}</td>
              <td className="py-2">{a.is_demo ? "DEMO" : ""}</td>
            </tr>
          ))}
          {(authorities ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-slate-400">
                No authorities yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
