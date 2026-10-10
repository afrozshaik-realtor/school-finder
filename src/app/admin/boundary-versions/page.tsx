import { redirect } from "next/navigation";
import { createClient, getCurrentUserWithRole } from "@/lib/supabase/server";
import { AdminNav } from "@/components/AdminNav";
import { BoundaryVersionActions } from "./BoundaryVersionActions";

export const dynamic = "force-dynamic";

export default async function BoundaryVersionsPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) {
    redirect("/admin/login?next=/admin/boundary-versions");
  }
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
  const { data: versions, error } = await supabase
    .from("boundary_versions")
    .select("*, school_authorities(name)")
    .order("authority_id")
    .order("school_year", { ascending: false });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminNav current="/admin/boundary-versions" />
      <h1 className="text-xl font-bold text-slate-900">Boundary versions</h1>
      <p className="mt-1 text-sm text-slate-600">
        Publishing a version archives the previously-current version for the same authority,
        school year, and program scope -- it is never deleted, and can be rolled back to at any
        time. Every publish/rollback is written to{" "}
        <code className="rounded bg-slate-100 px-1">admin_actions</code> for audit.
      </p>

      {error && <p className="mt-4 text-red-700">{error.message}</p>}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">Authority</th>
            <th className="py-2">School year</th>
            <th className="py-2">Program scope</th>
            <th className="py-2">Status</th>
            <th className="py-2">Coverage complete</th>
            <th className="py-2">Demo</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {(versions ?? []).map((v) => (
            <tr key={v.id} className="border-b border-slate-100">
              <td className="py-2">{v.school_authorities?.name ?? v.authority_id}</td>
              <td className="py-2">{v.school_year}</td>
              <td className="py-2">{v.program_scope ?? "(general)"}</td>
              <td className="py-2">
                <span
                  className={
                    v.status === "published"
                      ? "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800"
                      : v.status === "draft"
                        ? "rounded bg-slate-100 px-2 py-0.5 text-slate-700"
                        : "rounded bg-slate-200 px-2 py-0.5 text-slate-600"
                  }
                >
                  {v.status}
                  {v.is_current ? " (current)" : ""}
                </span>
              </td>
              <td className="py-2">{v.coverage_complete ? "Yes" : "No"}</td>
              <td className="py-2">{v.is_demo ? "DEMO" : ""}</td>
              <td className="py-2">
                <BoundaryVersionActions
                  versionId={v.id}
                  status={v.status}
                  canRollback={role === "admin"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
