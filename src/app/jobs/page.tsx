"use client";

import { Fragment, useEffect, useState } from "react";
import type {
  BuildFailureDto,
  JobBuildDto,
  JobBuildsResponseDto,
  JobDto,
  SyncLogDto,
  SyncLogsResponseDto,
} from "@/types/api";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";

type Panel = "logs" | "builds" | null;

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [name, setName] = useState("");
  const [jenkinsPath, setJenkinsPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);

  function load() {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs);
  }

  useEffect(load, []);

  function togglePanel(jobId: string, which: Exclude<Panel, null>) {
    if (expandedJobId === jobId && panel === which) {
      setExpandedJobId(null);
      setPanel(null);
      return;
    }
    setExpandedJobId(jobId);
    setPanel(which);
  }

  async function addJob(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, jenkinsPath }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(JSON.stringify(data.error ?? "Failed to add job"));
        return;
      }
      setName("");
      setJenkinsPath("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(job: JobDto) {
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    load();
  }

  async function removeJob(job: JobDto) {
    if (!confirm(`Delete job "${job.name}" and all related data (tests, failures, tickets)?`)) return;
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    if (expandedJobId === job.id) {
      setExpandedJobId(null);
      setPanel(null);
    }
    load();
  }

  async function syncOne(job: JobDto) {
    setSyncingId(job.id);
    try {
      const res = await fetch(`/api/sync?jobId=${job.id}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Sync failed");
      }
      load();
      if (expandedJobId === job.id && panel === "logs") {
        setLogsRefreshKey((k) => k + 1);
      }
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Jenkins jobs</h1>

      <form onSubmit={addJob} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Display name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. backend-integration-tests"
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Jenkins job path
          </label>
          <input
            required
            value={jenkinsPath}
            onChange={(e) => setJenkinsPath(e.target.value)}
            placeholder="e.g. team-folder/backend-integration-tests"
            className="rounded-md border px-2 py-1.5 text-sm font-mono"
            style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          {saving ? "Adding…" : "Add job"}
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Jenkins path</th>
              <th className="px-4 py-2 text-left font-medium">Tests</th>
              <th className="px-4 py-2 text-left font-medium">Last sync</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <Fragment key={job.id}>
                <tr className="border-t" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-2 font-medium">{job.name}</td>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                    {job.jenkinsPath}
                  </td>
                  <td className="px-4 py-2">{job._count.testCases}</td>
                  <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                    {job.lastSyncAt
                      ? formatDistanceToNow(new Date(job.lastSyncAt), { addSuffix: true })
                      : "never"}
                    {job.lastSyncError && (
                      <div className="text-xs" style={{ color: "var(--status-critical)" }}>
                        {job.lastSyncError}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleEnabled(job)}
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: job.enabled ? "var(--status-good)" : "var(--gridline)",
                        color: job.enabled ? "#fff" : "var(--text-secondary)",
                      }}
                    >
                      {job.enabled ? "enabled" : "disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => syncOne(job)}
                        disabled={syncingId === job.id}
                        className="text-xs underline disabled:opacity-60"
                        style={{ color: "var(--series-1)" }}
                      >
                        {syncingId === job.id ? "syncing…" : "sync"}
                      </button>
                      <button
                        onClick={() => togglePanel(job.id, "logs")}
                        className="text-xs underline"
                        style={{ color: "var(--series-1)" }}
                      >
                        {expandedJobId === job.id && panel === "logs" ? "hide logs" : "logs"}
                      </button>
                      <button
                        onClick={() => togglePanel(job.id, "builds")}
                        className="text-xs underline"
                        style={{ color: "var(--series-1)" }}
                      >
                        {expandedJobId === job.id && panel === "builds" ? "hide builds" : "builds"}
                      </button>
                      <button
                        onClick={() => removeJob(job)}
                        className="text-xs underline"
                        style={{ color: "var(--status-critical)" }}
                      >
                        delete
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedJobId === job.id && (
                  <tr className="border-t" style={{ borderColor: "var(--gridline)" }}>
                    <td colSpan={6} className="px-4 py-3" style={{ background: "var(--page)" }}>
                      {panel === "logs" && (
                        <SyncLogPanel jobId={job.id} refreshSignal={logsRefreshKey} />
                      )}
                      {panel === "builds" && <BuildsPanel jobId={job.id} />}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                  No jobs configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        The job path is its location in Jenkins as it appears in the URL, e.g. for{" "}
        <code>https://jenkins/job/team/job/my-tests/</code> use <code>team/my-tests</code>.
        The Jenkins connection (URL, user, token) is configured in the <code>.env</code> file.
      </p>
    </div>
  );
}

const LOG_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function SyncLogPanel({ jobId, refreshSignal }: { jobId: string; refreshSignal: number }) {
  const [logs, setLogs] = useState<SyncLogDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  function load() {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (statusFilter) qs.set("status", statusFilter);
    fetch(`/api/jobs/${jobId}/logs?${qs}`)
      .then((r) => r.json())
      .then((data: SyncLogsResponseDto) => {
        setLogs(data.logs);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, statusFilter, page, pageSize, refreshSignal]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  function updateFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  const selectStyle = {
    borderColor: "var(--border)",
    background: "var(--surface-1)",
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Sync history (most recent first)
        </div>
        <button onClick={load} className="text-xs underline shrink-0" style={{ color: "var(--series-1)" }}>
          refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={statusFilter}
          onChange={(e) => updateFilter(e.target.value)}
          className="rounded border px-1.5 py-1"
          style={selectStyle}
        >
          <option value="">Any status</option>
          <option value="ok">OK</option>
          <option value="error">NOT OK</option>
        </select>
        <label className="ml-auto flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded border px-1.5 py-1"
            style={selectStyle}
          >
            {LOG_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Loading sync history…
        </p>
      ) : logs.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {statusFilter
            ? "No sync attempts match this filter."
            : 'No sync attempts recorded yet — hit "sync" to trigger one.'}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {logs.map((log) => (
              <li key={log.id} className="flex items-start gap-2 text-xs">
                <span
                  className="mt-0.5 rounded px-1.5 py-0.5 font-semibold text-white shrink-0"
                  style={{
                    background: log.success ? "var(--status-good)" : "var(--status-critical)",
                  }}
                >
                  {log.success ? "OK" : "ERROR"}
                </span>
                <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                  {format(new Date(log.startedAt), "d MMM yyyy, HH:mm:ss")}
                </span>
                <span style={{ color: "var(--text-primary)" }}>{log.message}</span>
              </li>
            ))}
          </ul>
          <div
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of{" "}
              {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
                className="rounded px-2 py-1 disabled:opacity-30"
                style={{ color: "var(--series-1)" }}
              >
                « First
              </button>
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded px-2 py-1 disabled:opacity-30"
                style={{ color: "var(--series-1)" }}
              >
                ‹ Prev
              </button>
              <span className="px-2" style={{ color: "var(--text-secondary)" }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="rounded px-2 py-1 disabled:opacity-30"
                style={{ color: "var(--series-1)" }}
              >
                Next ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                className="rounded px-2 py-1 disabled:opacity-30"
                style={{ color: "var(--series-1)" }}
              >
                Last »
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_OPTIONS = ["SUCCESS", "UNSTABLE", "FAILURE", "ABORTED", "NOT_BUILT"];
const BUILD_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function BuildsPanel({ jobId }: { jobId: string }) {
  const [builds, setBuilds] = useState<JobBuildDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedBuildId, setExpandedBuildId] = useState<string | null>(null);
  const [buildFailures, setBuildFailures] = useState<BuildFailureDto[]>([]);
  const [failuresLoading, setFailuresLoading] = useState(false);
  const [reasonDraftFor, setReasonDraftFor] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [saving, setSaving] = useState(false);

  const [statusFilter, setStatusFilter] = useState("");
  const [invalidFilter, setInvalidFilter] = useState("");
  const [hasFailuresFilter, setHasFailuresFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  function load() {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (statusFilter) qs.set("status", statusFilter);
    if (invalidFilter) qs.set("invalid", invalidFilter);
    if (hasFailuresFilter) qs.set("hasFailures", hasFailuresFilter);
    fetch(`/api/jobs/${jobId}/builds?${qs}`)
      .then((r) => r.json())
      .then((data: JobBuildsResponseDto) => {
        setBuilds(data.builds);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, statusFilter, invalidFilter, hasFailuresFilter, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  function updateFilter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function toggleFailures(buildId: string) {
    if (expandedBuildId === buildId) {
      setExpandedBuildId(null);
      return;
    }
    setExpandedBuildId(buildId);
    setFailuresLoading(true);
    fetch(`/api/builds/${buildId}/failures`)
      .then((r) => r.json())
      .then(setBuildFailures)
      .finally(() => setFailuresLoading(false));
  }

  async function markInvalid(buildId: string) {
    if (!reasonText.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/builds/${buildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: true, reason: reasonText.trim() }),
      });
      setReasonDraftFor(null);
      setReasonText("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function unmarkInvalid(buildId: string) {
    setSaving(true);
    try {
      await fetch(`/api/builds/${buildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: false }),
      });
      load();
    } finally {
      setSaving(false);
    }
  }

  const selectStyle = {
    borderColor: "var(--border)",
    background: "var(--surface-1)",
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Mark a build invalid (e.g. infra outage causing mass failures) to exclude its
          failures from dashboard stats. Full history stays visible here.
        </div>
        <button onClick={load} className="text-xs underline shrink-0" style={{ color: "var(--series-1)" }}>
          refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={statusFilter}
          onChange={(e) => updateFilter(setStatusFilter, e.target.value)}
          className="rounded border px-1.5 py-1"
          style={selectStyle}
        >
          <option value="">Any status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={invalidFilter}
          onChange={(e) => updateFilter(setInvalidFilter, e.target.value)}
          className="rounded border px-1.5 py-1"
          style={selectStyle}
        >
          <option value="">Any validity</option>
          <option value="false">Valid only</option>
          <option value="true">Invalid only</option>
        </select>
        <select
          value={hasFailuresFilter}
          onChange={(e) => updateFilter(setHasFailuresFilter, e.target.value)}
          className="rounded border px-1.5 py-1"
          style={selectStyle}
        >
          <option value="">Any failures</option>
          <option value="true">Has failed tests</option>
          <option value="false">No failed tests</option>
        </select>
        <label className="ml-auto flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded border px-1.5 py-1"
            style={selectStyle}
          >
            {BUILD_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Loading builds…
        </p>
      ) : builds.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No builds match these filters.
        </p>
      ) : (
        <>
      <ul className="flex flex-col gap-1.5">
        {builds.map((b) => (
          <li key={b.id} className="rounded-md border p-2" style={{ borderColor: "var(--gridline)" }}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <a
                href={b.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
                style={{ color: "var(--series-1)" }}
              >
                #{b.number}
              </a>
              <span
                className="rounded px-1.5 py-0.5 font-semibold text-white"
                style={{
                  background:
                    b.result === "SUCCESS" ? "var(--status-good)" : "var(--status-critical)",
                }}
              >
                {b.result ?? "?"}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {format(new Date(b.timestamp), "d MMM yyyy, HH:mm")}
              </span>
              {b.failureCount > 0 ? (
                <button
                  onClick={() => toggleFailures(b.id)}
                  className="rounded-full px-2 py-0.5 font-semibold text-white"
                  style={{ background: "var(--status-critical)" }}
                >
                  {b.failureCount} failed {expandedBuildId === b.id ? "▲" : "▼"}
                </button>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>0 failed</span>
              )}
              {b.invalid ? (
                <span
                  className="rounded px-1.5 py-0.5 font-semibold"
                  style={{ background: "var(--gridline)", color: "var(--text-secondary)" }}
                >
                  INVALID
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                {b.invalid ? (
                  <button
                    onClick={() => unmarkInvalid(b.id)}
                    disabled={saving}
                    className="underline disabled:opacity-60"
                    style={{ color: "var(--series-1)" }}
                  >
                    unmark invalid
                  </button>
                ) : reasonDraftFor === b.id ? (
                  <>
                    <input
                      autoFocus
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      placeholder="reason, e.g. CI infra outage"
                      className="rounded border px-1.5 py-0.5 text-xs"
                      style={{ borderColor: "var(--border)", background: "var(--surface-1)", width: 200 }}
                    />
                    <button
                      onClick={() => markInvalid(b.id)}
                      disabled={saving || !reasonText.trim()}
                      className="underline disabled:opacity-60"
                      style={{ color: "var(--series-1)" }}
                    >
                      confirm
                    </button>
                    <button
                      onClick={() => {
                        setReasonDraftFor(null);
                        setReasonText("");
                      }}
                      style={{ color: "var(--text-muted)" }}
                    >
                      cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setReasonDraftFor(b.id)}
                    className="underline"
                    style={{ color: "var(--status-critical)" }}
                  >
                    mark invalid
                  </button>
                )}
              </div>
            </div>
            {b.invalid && b.invalidReason && (
              <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                Reason: {b.invalidReason}
                {b.invalidAt && (
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    · {format(new Date(b.invalidAt), "d MMM yyyy, HH:mm")}
                  </span>
                )}
              </div>
            )}
            {expandedBuildId === b.id && (
              <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--gridline)" }}>
                {failuresLoading ? (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Loading…
                  </span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {buildFailures.map((f) => (
                      <li key={f.testCaseId} className="text-xs">
                        <Link
                          href={`/tests/${f.testCaseId}`}
                          className="underline"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {f.testName}
                        </Link>
                        <span style={{ color: "var(--text-muted)" }}> ({f.className})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>
          Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of{" "}
          {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(1)}
            disabled={currentPage === 1}
            className="rounded px-2 py-1 disabled:opacity-30"
            style={{ color: "var(--series-1)" }}
          >
            « First
          </button>
          <button
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="rounded px-2 py-1 disabled:opacity-30"
            style={{ color: "var(--series-1)" }}
          >
            ‹ Prev
          </button>
          <span className="px-2" style={{ color: "var(--text-secondary)" }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="rounded px-2 py-1 disabled:opacity-30"
            style={{ color: "var(--series-1)" }}
          >
            Next ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={currentPage === totalPages}
            className="rounded px-2 py-1 disabled:opacity-30"
            style={{ color: "var(--series-1)" }}
          >
            Last »
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
