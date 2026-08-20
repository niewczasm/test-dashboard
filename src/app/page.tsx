"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatTile } from "@/components/StatTile";
import { FailuresByJobChart } from "@/components/FailuresByJobChart";
import { FailuresTrendChart } from "@/components/FailuresTrendChart";
import { TagBadge } from "@/components/TagBadge";
import type { JobDto, StatsDto, TopFailingTestDto } from "@/types/api";
import { shortenTestIdentifier } from "@/lib/testName";
import { format, formatDistanceToNow } from "date-fns";

const WINDOW_OPTIONS = [1, 3, 5, 7, 14, 30, 90];

type WindowMode = { kind: "days"; days: number } | { kind: "all" };

function windowModeLabel(mode: WindowMode): string {
  if (mode.kind === "all") return "all time";
  return mode.days === 1 ? "24h" : `${mode.days}d`;
}

function statTileLabel(mode: WindowMode, stats: StatsDto | null): string {
  if (mode.kind === "all") {
    return stats?.sinceDate
      ? `Failures since ${format(new Date(stats.sinceDate), "d MMM yyyy")}`
      : "Failures (all time)";
  }
  return `Failures in ${windowModeLabel(mode)}`;
}

function buildResultColor(result: string | null): string {
  switch (result) {
    case "SUCCESS":
      return "var(--status-good)";
    case "UNSTABLE":
      return "var(--status-warning)";
    case "FAILURE":
      return "var(--status-critical)";
    default:
      return "var(--text-muted)";
  }
}

/** Surfaces broken/unstable jobs first, then never-synced ones, healthy jobs last. */
function jobHealthPriority(job: JobDto): number {
  if (!job.latestBuild) return 1;
  if (job.latestBuild.result === "SUCCESS") return 2;
  return 0;
}
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const WIDTHS_STORAGE_KEY = "dashboard-top-failing-tests-column-widths";
const WINDOW_MODE_STORAGE_KEY = "dashboard-window-mode";
const LATEST_BUILDS_EXPANDED_KEY = "dashboard-latest-builds-expanded";
const FAILURES_BY_JOB_EXPANDED_KEY = "dashboard-failures-by-job-expanded";
const FAILURES_PER_DAY_EXPANDED_KEY = "dashboard-failures-per-day-expanded";

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

// "test" starts at `null` — meaning it's not pinned to a px width, it just
// fills whatever space is left after the other five columns take what they
// need. It becomes a fixed number the moment the user drags its handle.
type ColumnWidths = { test: number | null } & Record<Exclude<ColumnKey, "test">, number>;

const DEFAULT_WIDTHS: ColumnWidths = {
  test: null,
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
  const [windowMode, setWindowModeState] = useState<WindowMode>({ kind: "days", days: 30 });
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [jobId, setJobId] = useState<string>("");
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("failures");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_WIDTHS);
  const [latestBuildsExpanded, setLatestBuildsExpanded] = useState(true);
  const [failuresByJobExpanded, setFailuresByJobExpanded] = useState(true);
  const [failuresPerDayExpanded, setFailuresPerDayExpanded] = useState(true);
  // Stays false until the localStorage read below resolves, so the very
  // first stats fetch already uses the persisted time window instead of
  // firing once with the default (30d) and again moments later with the
  // corrected value — that double-fetch was the visible flicker.
  const [windowReady, setWindowReady] = useState(false);
  const loading = stats === null;

  const jenkinsPathByJobId = new Map(jobs.map((j) => [j.id, j.jenkinsPath]));
  const jobHealthList = (jobId ? jobs.filter((j) => j.id === jobId) : [...jobs]).sort((a, b) => {
    const diff = jobHealthPriority(a) - jobHealthPriority(b);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
  const showFailuresByJobChart = !jobId && jobs.length > 1;
  // Only the literal 24h preset is too short for a meaningful daily trend;
  // any custom window or "all time" still gets the chart.
  const showTrendChart = !(windowMode.kind === "days" && windowMode.days === 1);
  // Collapsing one chart just hides its own body, leaving its header card in
  // place next to the other one. Collapsing both is different — there's no
  // point showing two empty header-only cards side by side, so the whole
  // section goes away instead.
  const bothChartsApplicable = showTrendChart && showFailuresByJobChart;
  const bothChartsCollapsed = !failuresPerDayExpanded && !failuresByJobExpanded;
  const hideChartsSection = bothChartsApplicable && bothChartsCollapsed;

  // Read persisted column widths / time window after mount only, so the
  // server-rendered markup (which has no access to localStorage) matches
  // the first client render and React doesn't complain about a hydration
  // mismatch.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(WIDTHS_STORAGE_KEY);
        if (raw) setColumnWidths((prev) => ({ ...prev, ...JSON.parse(raw) }));
      } catch {
        // ignore malformed/unavailable storage
      }
      try {
        const raw = localStorage.getItem(WINDOW_MODE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed?.kind === "all") {
          setWindowModeState({ kind: "all" });
        } else if (parsed?.kind === "days" && typeof parsed.days === "number" && parsed.days > 0) {
          setWindowModeState({ kind: "days", days: parsed.days });
        }
      } catch {
        // ignore malformed/unavailable storage
      } finally {
        setWindowReady(true);
      }
      try {
        const rawLatestBuilds = localStorage.getItem(LATEST_BUILDS_EXPANDED_KEY);
        if (rawLatestBuilds !== null) setLatestBuildsExpanded(rawLatestBuilds === "true");
        const rawFailuresByJob = localStorage.getItem(FAILURES_BY_JOB_EXPANDED_KEY);
        if (rawFailuresByJob !== null) setFailuresByJobExpanded(rawFailuresByJob === "true");
        const rawFailuresPerDay = localStorage.getItem(FAILURES_PER_DAY_EXPANDED_KEY);
        if (rawFailuresPerDay !== null) setFailuresPerDayExpanded(rawFailuresPerDay === "true");
      } catch {
        // ignore malformed/unavailable storage
      }
    });
  }, []);

  function toggleLatestBuildsExpanded() {
    setLatestBuildsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LATEST_BUILDS_EXPANDED_KEY, String(next));
      } catch {
        // ignore unavailable storage
      }
      return next;
    });
  }

  function toggleFailuresByJobExpanded() {
    setFailuresByJobExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(FAILURES_BY_JOB_EXPANDED_KEY, String(next));
      } catch {
        // ignore unavailable storage
      }
      return next;
    });
  }

  function toggleFailuresPerDayExpanded() {
    setFailuresPerDayExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(FAILURES_PER_DAY_EXPANDED_KEY, String(next));
      } catch {
        // ignore unavailable storage
      }
      return next;
    });
  }

  function expandBothCharts() {
    setFailuresPerDayExpanded(true);
    setFailuresByJobExpanded(true);
    try {
      localStorage.setItem(FAILURES_PER_DAY_EXPANDED_KEY, "true");
      localStorage.setItem(FAILURES_BY_JOB_EXPANDED_KEY, "true");
    } catch {
      // ignore unavailable storage
    }
  }

  function selectWindowMode(mode: WindowMode) {
    setWindowModeState(mode);
    setPage(1);
    setCustomOpen(false);
    try {
      localStorage.setItem(WINDOW_MODE_STORAGE_KEY, JSON.stringify(mode));
    } catch {
      // ignore unavailable storage
    }
  }

  function applyCustomDays(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(customValue);
    if (!Number.isFinite(n) || n <= 0) return;
    selectWindowMode({ kind: "days", days: n });
    setCustomValue("");
  }

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!windowReady) return;
    const params = new URLSearchParams();
    if (windowMode.kind === "all") {
      params.set("all", "true");
    } else {
      params.set("days", String(windowMode.days));
    }
    if (jobId) params.set("jobId", jobId);
    fetch(`/api/stats?${params}`)
      .then((r) => r.json())
      .then(setStats);
  }, [windowMode, jobId, windowReady]);

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "failures" || column === "lastFailed" ? "desc" : "asc");
    }
  }

  function startResize(column: ColumnKey, e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    // "test" may still be in its unset (auto-fill) state, with no pixel
    // width to base the drag on yet — measure what it's actually rendered
    // at right now and use that as the starting point.
    const currentWidth = columnWidths[column];
    const startWidth =
      currentWidth ?? e.currentTarget.closest("th")?.getBoundingClientRect().width ?? MIN_WIDTHS[column];

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
  // While "test" is still auto-fill (null), the table just fills its
  // container and the browser hands that column whatever's left over. Once
  // the user has pinned "test" to a width too, fall back to summing every
  // column like the other resizable tables in this app do.
  const tableWidth =
    columnWidths.test === null
      ? "100%"
      : ALL_COLUMNS.reduce((sum, c) => sum + (columnWidths[c.key] ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="card flex flex-wrap overflow-hidden text-sm">
            {WINDOW_OPTIONS.map((d) => {
              const active = windowMode.kind === "days" && windowMode.days === d;
              return (
                <button
                  key={d}
                  onClick={() => selectWindowMode({ kind: "days", days: d })}
                  className="px-3 py-1.5"
                  style={{
                    background: active ? "var(--series-1)" : "transparent",
                    color: active ? "#fff" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {d === 1 ? "24h" : `${d}d`}
                </button>
              );
            })}
            <button
              onClick={() => selectWindowMode({ kind: "all" })}
              className="px-3 py-1.5"
              style={{
                background: windowMode.kind === "all" ? "var(--series-1)" : "transparent",
                color: windowMode.kind === "all" ? "#fff" : "var(--text-secondary)",
                fontWeight: windowMode.kind === "all" ? 600 : 400,
              }}
            >
              All
            </button>
            <button
              onClick={() => setCustomOpen((o) => !o)}
              className="px-3 py-1.5"
              style={{
                background: customOpen || (windowMode.kind === "days" && !WINDOW_OPTIONS.includes(windowMode.days))
                  ? "var(--series-1)"
                  : "transparent",
                color: customOpen || (windowMode.kind === "days" && !WINDOW_OPTIONS.includes(windowMode.days))
                  ? "#fff"
                  : "var(--text-secondary)",
                fontWeight: windowMode.kind === "days" && !WINDOW_OPTIONS.includes(windowMode.days) ? 600 : 400,
              }}
            >
              {windowMode.kind === "days" && !WINDOW_OPTIONS.includes(windowMode.days)
                ? windowModeLabel(windowMode)
                : "Custom"}
            </button>
          </div>
          {customOpen && (
            <form onSubmit={applyCustomDays} className="card flex items-center gap-2 px-3 py-1.5 text-sm">
              <input
                type="number"
                min="0.5"
                step="0.5"
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="e.g. 45"
                className="w-20 rounded border px-1.5 py-1 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--page)" }}
              />
              <span style={{ color: "var(--text-muted)" }}>days</span>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-xs font-medium text-white"
                style={{ background: "var(--series-1)" }}
              >
                Apply
              </button>
            </form>
          )}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile label={statTileLabel(windowMode, stats)} value={stats?.totalFailures ?? "–"} />
        <StatTile
          label="Unique failing tests"
          value={stats?.uniqueFailingTests ?? "–"}
          accent="var(--status-critical)"
        />
      </div>

      {jobHealthList.length > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={toggleLatestBuildsExpanded}
            className="flex w-full items-center justify-between gap-2 p-4 text-left"
            style={latestBuildsExpanded ? { borderBottom: "1px solid var(--border)" } : undefined}
          >
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Latest build per job
            </h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {latestBuildsExpanded ? "▲ hide" : "▼ show"}
            </span>
          </button>
          {latestBuildsExpanded && (
          <ul className="divide-y" style={{ borderColor: "var(--gridline)" }}>
            {jobHealthList.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
              >
                <Link
                  href="/jobs"
                  className="truncate font-medium hover:underline"
                  style={{ color: "var(--text-primary)" }}
                >
                  {job.name}
                </Link>
                {job.latestBuild ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={job.latestBuild.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline"
                      style={{ color: "var(--series-1)" }}
                    >
                      #{job.latestBuild.number}
                    </a>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-semibold text-white"
                      style={{ background: buildResultColor(job.latestBuild.result) }}
                    >
                      {job.latestBuild.result ?? "?"}
                    </span>
                    {job.latestBuild.failureCount > 0 && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ background: "var(--status-critical)" }}
                      >
                        {job.latestBuild.failureCount} failed
                      </span>
                    )}
                    {job.latestBuild.invalid && (
                      <span
                        className="rounded px-1.5 py-0.5 text-xs font-semibold"
                        style={{ background: "var(--gridline)", color: "var(--text-secondary)" }}
                        title="This build is marked invalid and excluded from stats"
                      >
                        INVALID
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {formatDistanceToNow(new Date(job.latestBuild.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    no builds synced yet
                  </span>
                )}
              </li>
            ))}
          </ul>
          )}
        </div>
      )}

      {(showTrendChart || showFailuresByJobChart) && hideChartsSection && (
        <button
          onClick={expandBothCharts}
          className="card flex w-full items-center justify-between p-3 text-left text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span>Charts hidden (Failures per day, Failures by job)</span>
          <span>▼ show</span>
        </button>
      )}

      {(showTrendChart || showFailuresByJobChart) && !hideChartsSection && (
        <div className={`grid grid-cols-1 gap-4 ${bothChartsApplicable ? "lg:grid-cols-2" : ""}`}>
          {showTrendChart && (
            <div className="card p-4">
              <button
                onClick={toggleFailuresPerDayExpanded}
                className="mb-2 flex w-full items-center justify-between gap-2 text-left"
              >
                <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  Failures per day
                </h2>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {failuresPerDayExpanded ? "▲ hide" : "▼ show"}
                </span>
              </button>
              {failuresPerDayExpanded && (
                <FailuresTrendChart data={stats?.failuresOverTime ?? []} />
              )}
            </div>
          )}
          {showFailuresByJobChart && (
            <div className="card p-4">
              <button
                onClick={toggleFailuresByJobExpanded}
                className="mb-2 flex w-full items-center justify-between gap-2 text-left"
              >
                <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  Failures by job
                </h2>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {failuresByJobExpanded ? "▲ hide" : "▼ show"}
                </span>
              </button>
              {failuresByJobExpanded && <FailuresByJobChart data={stats?.failuresByJob ?? []} />}
            </div>
          )}
        </div>
      )}

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
              {ALL_COLUMNS.map((col) => {
                const width = columnWidths[col.key];
                return <col key={col.key} style={width === null ? undefined : { width }} />;
              })}
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
                        <div className="flex items-center gap-1 overflow-hidden">
                          {t.ticketRegressedAfterFix && (
                            <span
                              className="shrink-0"
                              title={`Test failed again after the ticket was marked ${t.ticket.jiraStatus ?? "done"}`}
                            >
                              ⚠️
                            </span>
                          )}
                          {t.ticket.url ? (
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
                          )}
                        </div>
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
