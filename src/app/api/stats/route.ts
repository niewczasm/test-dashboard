import { NextRequest, NextResponse } from "next/server";
import { db, inPlaceholders, type SqlParam } from "@/lib/db";

const DEFAULT_DAYS = 30;
// Only caps how many day-buckets the trend chart zero-fills for, not the
// underlying totals/rankings — an "all time" window on a job with years of
// history would otherwise generate an unreasonable number of chart points.
const MAX_CHART_DAYS = 400;

interface FailureRow {
  testCaseId: string;
  className: string;
  testName: string;
  jobId: string;
  jobName: string;
  buildTimestamp: string;
  ticketKey: string | null;
  ticketUrl: string | null;
  ticketJiraStatus: string | null;
  ticketJiraStatusCategory: string | null;
  ticketJiraResolvedAt: string | null;
}

interface TagRow {
  testCaseId: string;
  id: string;
  name: string;
  color: string;
}

const DAY_MS = 24 * 3600_000;
// How many tag series the trend chart will plot at once — past this, extra
// tags are dropped (by ascending frequency) to keep the chart legible.
const MAX_TREND_TAGS = 12;

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId") ?? undefined;
  const now = new Date();
  const allTime = req.nextUrl.searchParams.get("all") === "true";

  const oldestBuildRow = db
    .prepare(`SELECT MIN(timestamp) AS ts FROM Build WHERE invalid = 0 ${jobId ? "AND jobId = ?" : ""}`)
    .get(...(jobId ? [jobId] : [])) as { ts: string | null };

  let since: Date;
  let windowDays: number | null;
  if (allTime) {
    since = oldestBuildRow.ts ? new Date(oldestBuildRow.ts) : now;
    windowDays = null;
  } else {
    const rawDays = Number(req.nextUrl.searchParams.get("days") ?? String(DEFAULT_DAYS));
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : DEFAULT_DAYS;
    since = new Date(now.getTime() - days * DAY_MS);
    windowDays = days;
  }
  const sinceIso = since.toISOString();
  // The trend chart shouldn't zero-fill days before the oldest build that
  // actually exists — e.g. a 90d window with only 15 days of real history
  // would otherwise draw 75 days of misleading flat zero. Totals/rankings
  // above still use the full `since` window; only the chart's start clamps.
  const chartStart =
    oldestBuildRow.ts && new Date(oldestBuildRow.ts) > since ? new Date(oldestBuildRow.ts) : since;
  // How many day-buckets the trend chart needs to cover the actual window,
  // capped so an "all time" span with years of history doesn't generate an
  // unreasonable number of chart points (see MAX_CHART_DAYS above).
  const chartDays = Math.min(
    MAX_CHART_DAYS,
    Math.max(1, Math.ceil((now.getTime() - chartStart.getTime()) / DAY_MS))
  );

  const params: SqlParam[] = [sinceIso];
  let jobFilter = "";
  if (jobId) {
    jobFilter = "AND tc.jobId = ?";
    params.push(jobId);
  }

  const failures = db
    .prepare(
      `SELECT
         tc.id AS testCaseId,
         tc.className,
         tc.testName,
         j.id AS jobId,
         j.name AS jobName,
         b.timestamp AS buildTimestamp,
         tk.key AS ticketKey,
         tk.url AS ticketUrl,
         tk.jiraStatus AS ticketJiraStatus,
         tk.jiraStatusCategory AS ticketJiraStatusCategory,
         tk.jiraResolvedAt AS ticketJiraResolvedAt
       FROM TestFailure tf
       JOIN Build b ON b.id = tf.buildId
       JOIN TestCase tc ON tc.id = tf.testCaseId
       JOIN Job j ON j.id = tc.jobId
       LEFT JOIN Ticket tk ON tk.testCaseId = tc.id
       WHERE b.timestamp >= ? AND b.invalid = 0 ${jobFilter}
       ORDER BY b.timestamp ASC`
    )
    .all(...params) as unknown as FailureRow[];

  const testCaseIds = [...new Set(failures.map((f) => f.testCaseId))];
  const tagsByTestCase = new Map<string, { id: string; name: string; color: string }[]>();
  if (testCaseIds.length > 0) {
    const tagRows = db
      .prepare(
        `SELECT toc.testCaseId, tg.id, tg.name, tg.color
         FROM TagOnTestCase toc
         JOIN Tag tg ON tg.id = toc.tagId
         WHERE toc.testCaseId IN (${inPlaceholders(testCaseIds)})`
      )
      .all(...testCaseIds) as unknown as TagRow[];
    for (const row of tagRows) {
      const list = tagsByTestCase.get(row.testCaseId) ?? [];
      list.push({ id: row.id, name: row.name, color: row.color });
      tagsByTestCase.set(row.testCaseId, list);
    }
  }

  const byTestCase = new Map<
    string,
    {
      testCaseId: string;
      className: string;
      testName: string;
      jobId: string;
      jobName: string;
      failureCount: number;
      lastFailedAt: string;
      ticket: {
        key: string;
        url: string | null;
        jiraStatus: string | null;
        jiraStatusCategory: string | null;
      } | null;
      ticketJiraResolvedAt: string | null;
      tags: { id: string; name: string; color: string }[];
    }
  >();
  const byJob = new Map<string, number>();
  const byDay = new Map<string, number>();
  // date -> tagId -> count, for the per-tag trend lines.
  const byDayTag = new Map<string, Map<string, number>>();
  const tagsUsed = new Map<string, { id: string; name: string; color: string; total: number }>();

  for (const f of failures) {
    const existing = byTestCase.get(f.testCaseId);
    if (existing) {
      existing.failureCount += 1;
      if (f.buildTimestamp > existing.lastFailedAt) {
        existing.lastFailedAt = f.buildTimestamp;
      }
    } else {
      byTestCase.set(f.testCaseId, {
        testCaseId: f.testCaseId,
        className: f.className,
        testName: f.testName,
        jobId: f.jobId,
        jobName: f.jobName,
        failureCount: 1,
        lastFailedAt: f.buildTimestamp,
        ticket: f.ticketKey
          ? {
              key: f.ticketKey,
              url: f.ticketUrl,
              jiraStatus: f.ticketJiraStatus,
              jiraStatusCategory: f.ticketJiraStatusCategory,
            }
          : null,
        ticketJiraResolvedAt: f.ticketJiraResolvedAt,
        tags: tagsByTestCase.get(f.testCaseId) ?? [],
      });
    }

    byJob.set(f.jobName, (byJob.get(f.jobName) ?? 0) + 1);

    const day = f.buildTimestamp.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);

    for (const tag of tagsByTestCase.get(f.testCaseId) ?? []) {
      const dayMap = byDayTag.get(day) ?? new Map<string, number>();
      dayMap.set(tag.id, (dayMap.get(tag.id) ?? 0) + 1);
      byDayTag.set(day, dayMap);

      const used = tagsUsed.get(tag.id);
      if (used) {
        used.total += 1;
      } else {
        tagsUsed.set(tag.id, { id: tag.id, name: tag.name, color: tag.color, total: 1 });
      }
    }
  }

  const topFailingTests = [...byTestCase.values()]
    .sort((a, b) => b.failureCount - a.failureCount)
    .map(({ ticketJiraResolvedAt, ...t }) => ({
      ...t,
      // Only a real regression if the test failed *after* the ticket was
      // marked resolved — not just any failure that happens to predate a
      // fix that landed later and is still sitting in the time window.
      ticketRegressedAfterFix: Boolean(
        t.ticket?.jiraStatusCategory === "done" &&
          ticketJiraResolvedAt &&
          t.lastFailedAt > ticketJiraResolvedAt
      ),
    }));
  const failuresByJob = [...byJob.entries()]
    .map(([name, count]) => ({ jobName: name, count }))
    .sort((a, b) => b.count - a.count);
  // The chart's own top tags, most-frequent first, capped so a job with
  // dozens of tags doesn't turn the trend chart into unreadable spaghetti.
  const trendTags = [...tagsUsed.values()]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, MAX_TREND_TAGS)
    .map(({ id, name, color }) => ({ id, name, color }));

  // Zero-fill every calendar day in the (possibly clamped) chart window, not
  // just the ones that happen to have a failure — otherwise a sparse or
  // stale job's chart only plots its few failed days pulled tight together,
  // which reads as if the x-axis only spans those days.
  const failuresOverTime = Array.from({ length: chartDays }, (_, i) => {
    const date = new Date(now.getTime() - (chartDays - 1 - i) * DAY_MS).toISOString().slice(0, 10);
    const dayTagCounts = byDayTag.get(date);
    const tagCounts: Record<string, number> = {};
    for (const tag of trendTags) {
      tagCounts[tag.id] = dayTagCounts?.get(tag.id) ?? 0;
    }
    return { date, total: byDay.get(date) ?? 0, tagCounts };
  });

  return NextResponse.json({
    windowDays,
    sinceDate: allTime ? sinceIso : null,
    totalFailures: failures.length,
    uniqueFailingTests: byTestCase.size,
    topFailingTests,
    failuresByJob,
    failuresOverTime,
    trendTags,
  });
}
