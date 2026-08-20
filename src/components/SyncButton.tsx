"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sync failed");
      } else {
        router.refresh();
      }
    } catch {
      setError("Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--series-1)" }}
      >
        {loading ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
