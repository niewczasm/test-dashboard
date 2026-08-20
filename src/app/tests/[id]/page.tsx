"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import type { TagDto, TestCaseDetailDto } from "@/types/api";
import { TagBadge } from "@/components/TagBadge";
import { format } from "date-fns";

const STATUS_COLOR: Record<string, string> = {
  FAILED: "var(--status-critical)",
  REGRESSION: "var(--status-serious)",
};

export default function TestCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [testCase, setTestCase] = useState<TestCaseDetailDto | null>(null);
  const [allTags, setAllTags] = useState<TagDto[]>([]);
  const [expandedFailureId, setExpandedFailureId] = useState<string | null>(null);

  const [ticketKey, setTicketKey] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [ticketNote, setTicketNote] = useState("");
  const [savingTicket, setSavingTicket] = useState(false);

  function load() {
    fetch(`/api/test-cases/${id}`)
      .then((r) => r.json())
      .then((data: TestCaseDetailDto) => {
        setTestCase(data);
        setTicketKey(data.ticket?.key ?? "");
        setTicketUrl(data.ticket?.url ?? "");
        setTicketNote(data.ticket?.note ?? "");
      });
  }

  useEffect(load, [id]);
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then(setAllTags);
  }, []);

  async function saveTicket(e: React.FormEvent) {
    e.preventDefault();
    setSavingTicket(true);
    try {
      await fetch(`/api/test-cases/${id}/ticket`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: ticketKey, url: ticketUrl, note: ticketNote }),
      });
      load();
    } finally {
      setSavingTicket(false);
    }
  }

  async function removeTicket() {
    await fetch(`/api/test-cases/${id}/ticket`, { method: "DELETE" });
    setTicketKey("");
    setTicketUrl("");
    setTicketNote("");
    load();
  }

  async function addTag(tagId: string) {
    if (!tagId) return;
    await fetch(`/api/test-cases/${id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    load();
  }

  async function removeTag(tagId: string) {
    await fetch(`/api/test-cases/${id}/tags?tagId=${tagId}`, { method: "DELETE" });
    load();
  }

  if (!testCase) {
    return <div style={{ color: "var(--text-muted)" }}>Loading…</div>;
  }

  const attachedTagIds = new Set(testCase.tags.map((t) => t.tag.id));
  const availableTags = allTags.filter((t) => !attachedTagIds.has(t.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-xs underline" style={{ color: "var(--series-1)" }}>
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{testCase.testName}</h1>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {testCase.className} · job{" "}
          <Link href="/jobs" className="underline">
            {testCase.job.name}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            JIRA ticket
          </h2>
          <form onSubmit={saveTicket} className="flex flex-col gap-2">
            <input
              value={ticketKey}
              onChange={(e) => setTicketKey(e.target.value)}
              placeholder="e.g. PROJ-123"
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--page)" }}
            />
            <input
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.target.value)}
              placeholder="ticket link (optional)"
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--page)" }}
            />
            <textarea
              value={ticketNote}
              onChange={(e) => setTicketNote(e.target.value)}
              placeholder="note (optional)"
              rows={2}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--page)" }}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingTicket || !ticketKey.trim()}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                style={{ background: "var(--series-1)" }}
              >
                {savingTicket ? "Saving…" : "Save"}
              </button>
              {testCase.ticket && (
                <button
                  type="button"
                  onClick={removeTicket}
                  className="rounded-md px-3 py-1.5 text-sm"
                  style={{ color: "var(--status-critical)" }}
                >
                  Remove
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Tags
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {testCase.tags.map(({ tag }) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} onRemove={() => removeTag(tag.id)} />
            ))}
            {availableTags.length > 0 && (
              <select
                onChange={(e) => {
                  addTag(e.target.value);
                  e.target.value = "";
                }}
                defaultValue=""
                className="rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--page)" }}
              >
                <option value="" disabled>
                  + add tag
                </option>
                {availableTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {allTags.length === 0 && (
              <Link href="/tags" className="text-xs underline" style={{ color: "var(--series-1)" }}>
                Create your first tag
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Failure history ({testCase.failures.length})
          </h2>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--gridline)" }}>
          {testCase.failures.map((f) => {
            const expanded = expandedFailureId === f.id;
            return (
              <li key={f.id} className="p-4">
                <button
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setExpandedFailureId(expanded ? null : f.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ background: STATUS_COLOR[f.status] ?? "var(--text-muted)" }}
                    >
                      {f.status}
                    </span>
                    <span className="text-sm font-medium">Build #{f.build.number}</span>
                    <a
                      href={f.build.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs underline"
                      style={{ color: "var(--series-1)" }}
                    >
                      open in Jenkins
                    </a>
                  </div>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {format(new Date(f.build.timestamp), "d MMM yyyy, HH:mm")}
                  </span>
                </button>
                {f.errorMessage && !expanded && (
                  <p
                    className="mt-2 truncate font-mono text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {f.errorMessage}
                  </p>
                )}
                {expanded && (
                  <div className="mt-3 flex flex-col gap-2">
                    {f.errorMessage && (
                      <div>
                        <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                          Error message
                        </div>
                        <pre
                          className="mt-1 max-h-40 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap"
                          style={{ background: "var(--page)", color: "var(--text-primary)" }}
                        >
                          {f.errorMessage}
                        </pre>
                      </div>
                    )}
                    {f.stackTrace && (
                      <div>
                        <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                          Stack trace
                        </div>
                        <pre
                          className="mt-1 max-h-80 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap"
                          style={{ background: "var(--page)", color: "var(--text-primary)" }}
                        >
                          {f.stackTrace}
                        </pre>
                      </div>
                    )}
                    {f.stdout && (
                      <div>
                        <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                          Standard output
                        </div>
                        <pre
                          className="mt-1 max-h-80 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap"
                          style={{ background: "var(--page)", color: "var(--text-primary)" }}
                        >
                          {f.stdout}
                        </pre>
                      </div>
                    )}
                    {f.stderr && (
                      <div>
                        <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                          Standard error
                        </div>
                        <pre
                          className="mt-1 max-h-80 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap"
                          style={{ background: "var(--page)", color: "var(--status-serious)" }}
                        >
                          {f.stderr}
                        </pre>
                      </div>
                    )}
                    {!f.errorMessage && !f.stackTrace && !f.stdout && !f.stderr && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Jenkins did not provide error details, stdout, or stderr for this build.
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {testCase.failures.length === 0 && (
            <li className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No recorded failures.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
