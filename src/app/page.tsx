"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatTile } from "@/components/StatTile";
import { FailuresByJobChart } from "@/components/FailuresByJobChart";
import { FailuresTrendChart } from "@/components/FailuresTrendChart";
import { TagBadge } from "@/components/TagBadge";
import type { JobDto, StatsDto, TopFailingTestDto } from "@/types/api";
import { shortenTestIdentifier } from "@/lib/testName";
import { formatDistanceToNow } from "date-fns";

const WINDOW_OPTIONS = [7, 14, 30, 90];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const WIDTHS_STORAGE_KEY = "dashboard-top-failing-tests-column-widths";

type SortColumn = "test" | "job" | "failures" | "lastFailed";
type SortDirection = "asc" | "desc";
type ColumnKey = SortColumn | "ticket" | "tags";

const ALL_COLUMNS: { key: ColumnKey; label: string; sortable: boolean }[] = [
  { key: "test", label: "Test", sortable: true },
  { key: "job", label: "Job", sortable: true },
  { key: "failures", label: "Failures", sortable: true },
  { key: "lastFailed", label: "Last failure", sortable: true },
  { key: "ticket", label: "Ticket", sortable: false },
  { key: "tags", label: "Tags", sortable: false },
];

const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  test: 340,
  job: 140,
  failures: 90,
  lastFailed: 140,
  ticket: 110,
  tags: 170,
};

const MIN_WIDTHS: Record<ColumnKey, number> = {
  test: 140,
  job: 80,
  failures: 70,
  lastFailed: 100,
  ticket: 80,
  tags: 100,
};

function sortValue(t: TopFailingTestDto, jenkinsPath: string, column: SortColumn) {
  switch (column) {
    case "test":
      return shortenTestIdentifier(t.testName, jenkinsPath).toLowerCase();
    case "job":
      return t.jobName.toLowerCase();
    case "failures":
      return t.failureCount;
    case "lastFailed":
      return t.lastFailedAt;
  }
}

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const [jobId, setJobId] = useState<string>("");
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("failures");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_WIDTHS);
  const loading = stats === null;

  const jenkinsPathByJobId = new Map(jobs.map((j) => [j.id, j.jenkinsPath]));

  // Read persisted column widths after mount only, so the server-rendered
  // markup (which has no access to localStorage) matches the first client
  // render and React doesn't complain about a hydration mismatch.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(WIDTHS_STORAGE_KEY);
        if (raw) setColumnWidths((prev) => ({ ...prev, ...JSON.parse(raw) }));
      } catch {
        // ignore malformed/unavailable storage
      }
    });
  }, []);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (jobId) params.set("jobId", jobId);
    fetch(`/api/stats?${params}`)
      .then((r) => r.json())
      .then(setStats);
  }, [days, jobId]);

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "failures" || column === "lastFailed" ? "desc" : "asc");
    }
  }

  function startResize(column: ColumnKey, e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[column];

    function onMove(ev: MouseEvent) {
      const next = Math.max(MIN_WIDTHS[column], startWidth + (ev.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [column]: next }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setColumnWidths((prev) => {
        try {
          localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(prev));
        } catch {
          // ignore
        }
        return prev;
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const sortedTests = [...(stats?.topFailingTests ?? [])].sort((a, b) => {
    const av = sortValue(a, jenkinsPathByJobId.get(a.jobId) ?? "", sortColumn);
    const bv = sortValue(b, jenkinsPathByJobId.get(b.jobId) ?? "", sortColumn);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDirection === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sortedTests.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageTests = sortedTests.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const tableWidth = ALL_COLUMNS.reduce((sum, c) => sum + columnWidths[c.key], 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <select
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              setPage(1);
            }}
            className="card px-2 py-1.5 text-sm"
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
          <div className="card flex overflow-hidden text-sm">
            {WINDOW_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDays(d);
                  setPage(1);
                }}
                className="px-3 py-1.5"
                style={{
                  background: days === d ? "var(--series-1)" : "transparent",
                  color: days === d ? "#fff" : "var(--text-secondary)",
                  fontWeight: days === d ? 600 : 400,
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {jobs.length === 0 && !loading && (
        <div className="card p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          You haven&apos;t configured any Jenkins jobs yet.{" "}
          <Link href="/jobs" className="underline" style={{ color: "var(--series-1)" }}>
            Add your first job
          </Link>{" "}
          to start collecting data about failing tests.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Failures in window" value={stats?.totalFailures ?? "–"} />
        <StatTile
          label="Unique failing tests"
          value={stats?.uniqueFailingTests ?? "–"}
          accent="var(--status-critical)"
        />
        <StatTile label="Tracked jobs" value={jobs.filter((j) => j.enabled).length} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Failures per day
          </h2>
          <FailuresTrendChart data={stats?.failuresOverTime ?? []} />
        </div>
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Failures by job
          </h2>
          <FailuresByJobChart data={stats?.failuresByJob ?? []} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Most frequently failing tests
          </h2>
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border px-1.5 py-1 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table
            className="text-sm"
            style={{ width: tableWidth, tableLayout: "fixed", borderCollapse: "collapse" }}
          >
            <colgroup>
              {ALL_COLUMNS.map((col) => (
                <col key={col.key} style={{ width: columnWidths[col.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {ALL_COLUMNS.map((col) => (
                  <th key={col.key} className="relative px-4 py-2 text-left font-medium">
                    {col.sortable ? (
                      <button
                        onClick={() => toggleSort(col.key as SortColumn)}
                        className="inline-flex max-w-full items-center gap-1 truncate hover:underline"
                        style={{ color: sortColumn === col.key ? "var(--text-primary)" : "inherit" }}
                      >
                        <span className="truncate">{col.label}</span>
                        <span
                          className="shrink-0"
                          style={{ opacity: sortColumn === col.key ? 1 : 0.25 }}
                        >
                          {sortColumn === col.key && sortDirection === "asc" ? "▲" : "▼"}
                        </span>
                      </button>
                    ) : (
                      <span className="block truncate">{col.label}</span>
                    )}
                    <div
                      onMouseDown={(e) => startResize(col.key, e)}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-[var(--series-1)]"
                      style={{ opacity: 0.5 }}
                      title="Drag to resize"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageTests.map((t) => {
                const jenkinsPath = jenkinsPathByJobId.get(t.jobId) ?? "";
                const shortTestName = shortenTestIdentifier(t.testName, jenkinsPath);
                const shortClassName = shortenTestIdentifier(t.className, jenkinsPath);
                return (
                  <tr key={t.testCaseId} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                    <td className="overflow-hidden px-4 py-2">
                      <Link
                        href={`/tests/${t.testCaseId}`}
                        className="block truncate font-medium hover:underline"
                        style={{ color: "var(--text-primary)", direction: "rtl", textAlign: "left" }}
                        title={t.testName}
                      >
                        {shortTestName}
                      </Link>
                      {shortClassName !== shortTestName && (
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--text-muted)", direction: "rtl", textAlign: "left" }}
                          title={t.className}
                        >
                          {shortClassName}
                        </div>
                      )}
                    </td>
                    <td
                      className="truncate px-4 py-2"
                      style={{ color: "var(--text-secondary)" }}
                      title={t.jobName}
                    >
                      {t.jobName}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="inline-flex min-w-[1.75rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: "var(--status-critical)", color: "#fff" }}
                      >
                        {t.failureCount}
                      </span>
                    </td>
                    <td className="truncate px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                      {formatDistanceToNow(new Date(t.lastFailedAt), { addSuffix: true })}
                    </td>
                    <td className="overflow-hidden px-4 py-2">
                      {t.ticket ? (
                        t.ticket.url ? (
                          <a
                            href={t.ticket.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate underline"
                            style={{ color: "var(--series-1)" }}
                            title={t.ticket.key}
                          >
                            {t.ticket.key}
                          </a>
                        ) : (
                          <span className="block truncate" title={t.ticket.key}>
                            {t.ticket.key}
                          </span>
                        )
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="overflow-hidden px-4 py-2">
                      <div className="flex flex-wrap gap-1 overflow-hidden">
                        {t.tags.map((tag) => (
                          <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && sortedTests.length === 0 && (
                <tr>
                  <td
                    colSpan={ALL_COLUMNS.length}
                    className="px-4 py-8 text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No failing tests in the selected window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sortedTests.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, sortedTests.length)} of {sortedTests.length}
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
        )}
      </div>
    </div>
  );
}
