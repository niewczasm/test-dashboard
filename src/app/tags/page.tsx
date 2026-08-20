"use client";

import { useEffect, useState } from "react";
import type { TagDto } from "@/types/api";
import { TagBadge } from "@/components/TagBadge";

const DEFAULT_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#4a3aa7",
  "#e34948",
];

export default function TagsPage() {
  const [tags, setTags] = useState<TagDto[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/tags")
      .then((r) => r.json())
      .then(setTags);
  }

  useEffect(load, []);

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(JSON.stringify(data.error ?? "Failed to add tag"));
      return;
    }
    setName("");
    load();
  }

  async function removeTag(id: string) {
    if (!confirm("Delete this tag? It will be removed from all tests.")) return;
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Tags</h1>

      <form onSubmit={addTag} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Tag name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. flaky, infra, needs-triage"
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Color
          </label>
          <div className="flex gap-1">
            {DEFAULT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full"
                style={{
                  background: c,
                  outline: color === c ? "2px solid var(--text-primary)" : "none",
                  outlineOffset: 2,
                }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <button
          type="submit"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: "var(--series-1)" }}
        >
          Add tag
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </form>

      <div className="card flex flex-wrap gap-2 p-4">
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center gap-1">
            <TagBadge name={tag.name} color={tag.color} onRemove={() => removeTag(tag.id)} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              ({tag._count?.testCases ?? 0})
            </span>
          </div>
        ))}
        {tags.length === 0 && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            No tags yet. Add your first one above.
          </span>
        )}
      </div>
    </div>
  );
}
