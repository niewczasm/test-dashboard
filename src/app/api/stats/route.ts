import { NextRequest, NextResponse } from "next/server";
import { db, inPlaceholders, type SqlParam } from "@/lib/db";
import { subDays } from "date-fns";

interface FailureRow {
  testCaseId: string;
  className: string;
  testName: string;
  jobId: string;
  jobName: string;
  buildTimestamp: string;
  ticketKey: string | null;
  ticketUrl: string | null;
}

interface TagRow {
  testCaseId: string;
  id: string;
  name: string;
  color: string;
}

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const jobId = req.nextUrl.searchParams.get("jobId") ?? undefined;
  const since = subDays(new Date(), Number.isFinite(days) && days > 0 ? days : 30).toISOString();

  const params: SqlParam[] = [since];
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
         tk.url AS ticketUrl
       FROM TestFailure tf
       JOIN Build b ON b.id = tf.buildId
       JOIN TestCase tc ON tc.id = tf.testCaseId
       JOIN Job j ON j.id = tc.jobId
       LEFT JOIN Ticket tk ON tk.testCaseId = tc.id
       WHERE b.timestamp >= ? ${jobFilter}
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
      ticket: { key: string; url: string | null } | null;
      tags: { id: string; name: string; color: string }[];
    }
  >();
  const byJob = new Map<string, number>();
  const byDay = new Map<string, number>();

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
        ticket: f.ticketKey ? { key: f.ticketKey, url: f.ticketUrl } : null,
        tags: tagsByTestCase.get(f.testCaseId) ?? [],
      });
    }

    byJob.set(f.jobName, (byJob.get(f.jobName) ?? 0) + 1);

    const day = f.buildTimestamp.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const topFailingTests = [...byTestCase.values()].sort((a, b) => b.failureCount - a.failureCount);
  const failuresByJob = [...byJob.entries()]
    .map(([name, count]) => ({ jobName: name, count }))
    .sort((a, b) => b.count - a.count);
  const failuresOverTime = [...byDay.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    windowDays: days,
    totalFailures: failures.length,
    uniqueFailingTests: byTestCase.size,
    topFailingTests,
    failuresByJob,
    failuresOverTime,
  });
}
