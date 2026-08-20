import { NextRequest, NextResponse } from "next/server";
import { db, inPlaceholders, type SqlParam } from "@/lib/db";

interface TestCaseRow {
  id: string;
  jobId: string;
  className: string;
  testName: string;
  firstSeen: string;
  lastSeen: string;
  jobName: string;
  ticketId: string | null;
  ticketKey: string | null;
  ticketUrl: string | null;
  ticketNote: string | null;
  ticketCreatedAt: string | null;
  ticketUpdatedAt: string | null;
  failureCount: number;
}

interface TagRow {
  testCaseId: string;
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId") ?? undefined;
  const tagId = req.nextUrl.searchParams.get("tagId") ?? undefined;
  const hasTicket = req.nextUrl.searchParams.get("hasTicket");
  const search = req.nextUrl.searchParams.get("q")?.trim();

  const conditions: string[] = [];
  const params: SqlParam[] = [];

  if (jobId) {
    conditions.push("tc.jobId = ?");
    params.push(jobId);
  }
  if (tagId) {
    conditions.push("EXISTS (SELECT 1 FROM TagOnTestCase toc WHERE toc.testCaseId = tc.id AND toc.tagId = ?)");
    params.push(tagId);
  }
  if (hasTicket === "true") {
    conditions.push("tk.id IS NOT NULL");
  } else if (hasTicket === "false") {
    conditions.push("tk.id IS NULL");
  }
  if (search) {
    conditions.push("(tc.className LIKE ? OR tc.testName LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT
         tc.id, tc.jobId, tc.className, tc.testName, tc.firstSeen, tc.lastSeen,
         j.name AS jobName,
         tk.id AS ticketId, tk.key AS ticketKey, tk.url AS ticketUrl, tk.note AS ticketNote,
         tk.createdAt AS ticketCreatedAt, tk.updatedAt AS ticketUpdatedAt,
         (SELECT COUNT(*) FROM TestFailure tf JOIN Build b ON b.id = tf.buildId
          WHERE tf.testCaseId = tc.id AND b.invalid = 0) AS failureCount
       FROM TestCase tc
       JOIN Job j ON j.id = tc.jobId
       LEFT JOIN Ticket tk ON tk.testCaseId = tc.id
       ${where}
       ORDER BY tc.lastSeen DESC`
    )
    .all(...params) as unknown as TestCaseRow[];

  const testCaseIds = rows.map((r) => r.id);
  const tagsByTestCase = new Map<string, TagRow[]>();
  if (testCaseIds.length > 0) {
    const tagRows = db
      .prepare(
        `SELECT toc.testCaseId, tg.id, tg.name, tg.color, tg.createdAt
         FROM TagOnTestCase toc
         JOIN Tag tg ON tg.id = toc.tagId
         WHERE toc.testCaseId IN (${inPlaceholders(testCaseIds)})`
      )
      .all(...testCaseIds) as unknown as TagRow[];
    for (const row of tagRows) {
      const list = tagsByTestCase.get(row.testCaseId) ?? [];
      list.push(row);
      tagsByTestCase.set(row.testCaseId, list);
    }
  }

  const testCases = rows.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    className: r.className,
    testName: r.testName,
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    job: { id: r.jobId, name: r.jobName },
    ticket: r.ticketId
      ? {
          id: r.ticketId,
          testCaseId: r.id,
          key: r.ticketKey,
          url: r.ticketUrl,
          note: r.ticketNote,
          createdAt: r.ticketCreatedAt,
          updatedAt: r.ticketUpdatedAt,
        }
      : null,
    tags: (tagsByTestCase.get(r.id) ?? []).map((t) => ({
      tag: { id: t.id, name: t.name, color: t.color, createdAt: t.createdAt },
    })),
    _count: { failures: r.failureCount },
  }));

  return NextResponse.json(testCases);
}
