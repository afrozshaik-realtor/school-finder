"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateAuthorityForm({ sources }: { sources: { id: string; name: string; organization: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch("/api/admin/authorities", {
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

  if (sources.length === 0) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Add a data source first -- every authority must cite one.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
      <input name="name" required placeholder="Name *" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <select name="authority_type" required defaultValue="public" className="rounded border border-slate-300 px-2 py-1 text-sm">
        <option value="public">Public</option>
        <option value="catholic">Catholic</option>
        <option value="private">Private</option>
        <option value="charter">Charter</option>
      </select>
      <input name="website" placeholder="Website" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="phone" placeholder="Phone" className="rounded border border-slate-300 px-2 py-1 text-sm" />
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
      {error && <p className="col-span-2 text-xs text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="col-span-2 mt-1 w-fit rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Adding..." : "Add authority"}
      </button>
    </form>
  );
}
