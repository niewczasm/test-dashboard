import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface TestCaseDetailRow {
  id: string;
  jobId: string;
  className: string;
  testName: string;
  firstSeen: string;
  lastSeen: string;
  jobName: string;
  jenkinsPath: string;
  ticketId: string | null;
  ticketKey: string | null;
  ticketUrl: string | null;
  ticketNote: string | null;
  ticketCreatedAt: string | null;
  ticketUpdatedAt: string | null;
}

interface TagRow {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

interface FailureRow {
  id: string;
  status: string;
  errorMessage: string | null;
  stackTrace: string | null;
  stdout: string | null;
  stderr: string | null;
  duration: number | null;
  createdAt: string;
  buildId: string;
  buildNumber: number;
  buildResult: string | null;
  buildTimestamp: string;
  buildUrl: string;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const row = db
    .prepare(
      `SELECT
         tc.id, tc.jobId, tc.className, tc.testName, tc.firstSeen, tc.lastSeen,
         j.name AS jobName, j.jenkinsPath,
         tk.id AS ticketId, tk.key AS ticketKey, tk.url AS ticketUrl, tk.note AS ticketNote,
         tk.createdAt AS ticketCreatedAt, tk.updatedAt AS ticketUpdatedAt
       FROM TestCase tc
       JOIN Job j ON j.id = tc.jobId
       LEFT JOIN Ticket tk ON tk.testCaseId = tc.id
       WHERE tc.id = ?`
    )
    .get(id) as unknown as TestCaseDetailRow | undefined;

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const tags = db
    .prepare(
      `SELECT tg.id, tg.name, tg.color, tg.createdAt
       FROM TagOnTestCase toc
       JOIN Tag tg ON tg.id = toc.tagId
       WHERE toc.testCaseId = ?`
    )
    .all(id) as unknown as TagRow[];

  const failures = db
    .prepare(
      `SELECT
         tf.id, tf.status, tf.errorMessage, tf.stackTrace, tf.stdout, tf.stderr, tf.duration, tf.createdAt,
         b.id AS buildId, b.number AS buildNumber, b.result AS buildResult,
         b.timestamp AS buildTimestamp, b.url AS buildUrl
       FROM TestFailure tf
       JOIN Build b ON b.id = tf.buildId
       WHERE tf.testCaseId = ?
       ORDER BY b.timestamp DESC`
    )
    .all(id) as unknown as FailureRow[];

  return NextResponse.json({
    id: row.id,
    jobId: row.jobId,
    className: row.className,
    testName: row.testName,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    job: { id: row.jobId, name: row.jobName, jenkinsPath: row.jenkinsPath },
    ticket: row.ticketId
      ? {
          id: row.ticketId,
          testCaseId: row.id,
          key: row.ticketKey,
          url: row.ticketUrl,
          note: row.ticketNote,
          createdAt: row.ticketCreatedAt,
          updatedAt: row.ticketUpdatedAt,
        }
      : null,
    tags: tags.map((t) => ({ tag: t })),
    failures: failures.map((f) => ({
      id: f.id,
      status: f.status,
      errorMessage: f.errorMessage,
      stackTrace: f.stackTrace,
      stdout: f.stdout,
      stderr: f.stderr,
      duration: f.duration,
      createdAt: f.createdAt,
      build: {
        id: f.buildId,
        number: f.buildNumber,
        result: f.buildResult,
        timestamp: f.buildTimestamp,
        url: f.buildUrl,
      },
    })),
  });
}
