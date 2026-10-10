"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BoundaryVersionActions({
  versionId,
  status,
  canRollback,
}: {
  versionId: string;
  status: string;
  canRollback: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      setError(body.error ?? "Request failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {status !== "published" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => call("/api/admin/boundary-versions/publish")}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Publish
        </button>
      )}
      {status === "archived" && canRollback && (
        <button
          type="button"
          disabled={busy}
          onClick={() => call("/api/admin/boundary-versions/rollback")}
          className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Roll back to this
        </button>
      )}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
