import { redirect } from "next/navigation";
import { createClient, getCurrentUserWithRole } from "@/lib/supabase/server";
import { AdminNav } from "@/components/AdminNav";
import { CreateProgramForm } from "@/components/admin/CreateProgramForm";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect("/admin/login?next=/admin/programs");
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
  const [{ data: programs, error }, { data: schools }, { data: sources }] = await Promise.all([
    supabase.from("school_programs").select("*, schools(name, city)").order("program_name"),
    supabase.from("schools").select("id, name, city").order("name"),
    supabase.from("data_sources").select("id, name, organization").order("name"),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <AdminNav current="/admin/programs" />
      <h1 className="text-xl font-bold text-slate-900">School programs</h1>
      <p className="mt-1 text-sm text-slate-600">
        Programs offered within a school (e.g. TLC, French Immersion, IB) -- distinct from the
        school&apos;s base type.
      </p>

      <div className="mt-6">
        <CreateProgramForm schools={schools ?? []} sources={sources ?? []} />
      </div>

      {error && <p className="mt-4 text-red-700">{error.message}</p>}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2">Program</th>
            <th className="py-2">School</th>
            <th className="py-2">Grades</th>
            <th className="py-2">Demo</th>
          </tr>
        </thead>
        <tbody>
          {(programs ?? []).map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="py-2">
                {p.program_name} {p.program_code ? `(${p.program_code})` : ""}
              </td>
              <td className="py-2">{p.schools ? `${p.schools.name} (${p.schools.city})` : "--"}</td>
              <td className="py-2">
                {p.grade_min ?? "?"}-{p.grade_max ?? "?"}
              </td>
              <td className="py-2">{p.is_demo ? "DEMO" : ""}</td>
            </tr>
          ))}
          {(programs ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-slate-400">
                No programs yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
