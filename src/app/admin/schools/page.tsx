import { redirect } from "next/navigation";
import { createClient, getCurrentUserWithRole } from "@/lib/supabase/server";
import { AdminNav } from "@/components/AdminNav";
import { CreateSchoolForm } from "@/components/admin/CreateSchoolForm";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect("/admin/login?next=/admin/schools");
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
  const [{ data: schools, error }, { data: authorities }, { data: sources }] = await Promise.all([
    supabase
      .from("schools")
      .select("*, school_authorities(name, authority_type)")
      .order("city")
      .order("name"),
    supabase.from("school_authorities").select("id, name, authority_type").order("name"),
    supabase.from("data_sources").select("id, name, organization").order("name"),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AdminNav current="/admin/schools" />
      <h1 className="text-xl font-bold text-slate-900">Schools</h1>
      <p className="mt-1 text-sm text-slate-600">
        Individual schools. Attendance-boundary designation is managed separately via{" "}
        <a href="/admin/boundary-versions" className="text-blue-700 underline">
          boundary versions
        </a>
        , not here.
      </p>

      <div className="mt-6">
        <CreateSchoolForm authorities={authorities ?? []} sources={sources ?? []} />
      </div>

      {error && <p className="mt-4 text-red-700">{error.message}</p>}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">Name</th>
            <th className="py-2">City</th>
            <th className="py-2">Type</th>
            <th className="py-2">Grades</th>
            <th className="py-2">Authority</th>
            <th className="py-2">Coordinates</th>
            <th className="py-2">Demo</th>
          </tr>
        </thead>
        <tbody>
          {(schools ?? []).map((s) => (
            <tr key={s.id} className="border-b border-slate-100">
              <td className="py-2">{s.name}</td>
              <td className="py-2">{s.city}</td>
              <td className="py-2 capitalize">{s.school_type}</td>
              <td className="py-2">
                {s.grade_min}-{s.grade_max}
              </td>
              <td className="py-2">{s.school_authorities?.name ?? "--"}</td>
              <td className="py-2">{s.latitude != null && s.longitude != null ? "set" : "unset"}</td>
              <td className="py-2">{s.is_demo ? "DEMO" : ""}</td>
            </tr>
          ))}
          {(schools ?? []).length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-center text-slate-400">
                No schools yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
