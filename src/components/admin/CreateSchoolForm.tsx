"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateSchoolForm({
  authorities,
  sources,
}: {
  authorities: { id: string; name: string; authority_type: string }[];
  sources: { id: string; name: string; organization: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch("/api/admin/schools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      setError(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  if (authorities.length === 0 || sources.length === 0) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Add a data source and an authority first -- every school must cite both.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
      <input name="name" required placeholder="School name *" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <select name="authority_id" required defaultValue="" className="rounded border border-slate-300 px-2 py-1 text-sm">
        <option value="" disabled>
          Authority *
        </option>
        {authorities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.authority_type})
          </option>
        ))}
      </select>
      <select name="school_type" required defaultValue="public" className="rounded border border-slate-300 px-2 py-1 text-sm">
        <option value="public">Public</option>
        <option value="catholic">Catholic</option>
        <option value="private">Private</option>
        <option value="charter">Charter</option>
      </select>
      <select name="city" required defaultValue="Calgary" className="rounded border border-slate-300 px-2 py-1 text-sm">
        <option value="Calgary">Calgary</option>
        <option value="Airdrie">Airdrie</option>
        <option value="Chestermere">Chestermere</option>
        <option value="Cochrane">Cochrane</option>
      </select>
      <input name="grade_min" required placeholder="Grade min (e.g. K) *" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="grade_max" required placeholder="Grade max (e.g. 6) *" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="address" required placeholder="Street address *" className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="postal_code" placeholder="Postal code" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="phone" placeholder="Phone" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="website" placeholder="Website" className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm" />
      <select name="source_id" required defaultValue="" className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm">
        <option value="" disabled>
          Source *
        </option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.organization})
          </option>
        ))}
      </select>
      <p className="col-span-2 text-xs text-slate-400">
        Map coordinates (latitude/longitude) aren&apos;t set from this form -- use
        <code className="mx-1 rounded bg-slate-100 px-1">scripts/import-schools.ts</code>
        for schools that need a map pin, or add coordinates directly once a real source
        provides them.
      </p>
      {error && <p className="col-span-2 text-xs text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="col-span-2 mt-1 w-fit rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Adding..." : "Add school"}
      </button>
    </form>
  );
}
