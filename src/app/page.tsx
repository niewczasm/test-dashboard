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

type SortColumn = "test" | "job" | "failures" | "lastFailed";
type SortDirection = "asc" | "desc";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "test", label: "Test" },
  { key: "job", label: "Job" },
  { key: "failures", label: "Failures" },
  { key: "lastFailed", label: "Last failure" },
];

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
  const loading = stats === null;

  const jenkinsPathByJobId = new Map(jobs.map((j) => [j.id, j.jenkinsPath]));

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "failures" || column === "lastFailed" ? "desc" : "asc");
    }
  }

  const sortedTests = [...(stats?.topFailingTests ?? [])].sort((a, b) => {
    const av = sortValue(a, jenkinsPathByJobId.get(a.jobId) ?? "", sortColumn);
    const bv = sortValue(b, jenkinsPathByJobId.get(b.jobId) ?? "", sortColumn);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDirection === "asc" ? cmp : -cmp;
  });

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
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
                onClick={() => setDays(d)}
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
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Most frequently failing tests
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="px-4 py-2 text-left font-medium">
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:underline"
                      style={{ color: sortColumn === col.key ? "var(--text-primary)" : "inherit" }}
                    >
                      {col.label}
                      <span style={{ opacity: sortColumn === col.key ? 1 : 0.25 }}>
                        {sortColumn === col.key && sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2 text-left font-medium">Ticket</th>
                <th className="px-4 py-2 text-left font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {sortedTests.map((t) => {
                const jenkinsPath = jenkinsPathByJobId.get(t.jobId) ?? "";
                const shortTestName = shortenTestIdentifier(t.testName, jenkinsPath);
                const shortClassName = shortenTestIdentifier(t.className, jenkinsPath);
                return (
                <tr key={t.testCaseId} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-2">
                    <Link
                      href={`/tests/${t.testCaseId}`}
                      className="font-medium hover:underline"
                      style={{ color: "var(--text-primary)" }}
                      title={t.testName !== shortTestName ? t.testName : undefined}
                    >
                      {shortTestName}
                    </Link>
                    {shortClassName !== shortTestName && (
                      <div
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                        title={t.className !== shortClassName ? t.className : undefined}
                      >
                        {shortClassName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
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
                  <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                    {formatDistanceToNow(new Date(t.lastFailedAt), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-2">
                    {t.ticket ? (
                      t.ticket.url ? (
                        <a
                          href={t.ticket.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                          style={{ color: "var(--series-1)" }}
                        >
                          {t.ticket.key}
                        </a>
                      ) : (
                        <span>{t.ticket.key}</span>
                      )
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.tags.map((tag) => (
                        <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                      ))}
                    </div>
                  </td>
                </tr>
                );
              })}
              {!loading && (stats?.topFailingTests.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    No failing tests in the selected window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
