"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateSourceForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch("/api/admin/sources", {
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

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
      <input name="name" required placeholder="Name *" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="organization" required placeholder="Organization *" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="source_url" placeholder="Source URL" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="license" placeholder="License" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="license_url" placeholder="License URL" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <input name="last_verified_at" placeholder="Last verified (YYYY-MM-DD)" className="rounded border border-slate-300 px-2 py-1 text-sm" />
      <textarea name="coverage_description" placeholder="Coverage description" className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm" />
      <textarea name="authorization_notes" placeholder="Authorization notes" className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm" />
      {error && <p className="col-span-2 text-xs text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="col-span-2 mt-1 w-fit rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Adding..." : "Add source"}
      </button>
    </form>
  );
}
