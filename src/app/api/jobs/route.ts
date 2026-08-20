import { NextRequest, NextResponse } from "next/server";
import { db, newId, nowIso, toBool } from "@/lib/db";
import { z } from "zod";

interface JobRow {
  id: string;
  name: string;
  jenkinsPath: string;
  enabled: number;
  lastSyncedBuild: number | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  testCaseCount: number;
  latestBuildId: string | null;
  latestBuildNumber: number | null;
  latestBuildResult: string | null;
  latestBuildTimestamp: string | null;
  latestBuildUrl: string | null;
  latestBuildInvalid: number | null;
  latestBuildFailureCount: number | null;
}

export async function GET() {
  const rows = db
    .prepare(
      `SELECT j.*,
         (SELECT COUNT(*) FROM TestCase tc WHERE tc.jobId = j.id) AS testCaseCount,
         lb.id AS latestBuildId, lb.number AS latestBuildNumber, lb.result AS latestBuildResult,
         lb.timestamp AS latestBuildTimestamp, lb.url AS latestBuildUrl, lb.invalid AS latestBuildInvalid,
         (SELECT COUNT(*) FROM TestFailure WHERE buildId = lb.id) AS latestBuildFailureCount
       FROM Job j
       LEFT JOIN Build lb ON lb.id = (
         SELECT id FROM Build WHERE jobId = j.id ORDER BY timestamp DESC LIMIT 1
       )
       ORDER BY j.name ASC`
    )
    .all() as unknown as JobRow[];

  const jobs = rows.map((r) => ({
    id: r.id,
    name: r.name,
    jenkinsPath: r.jenkinsPath,
    enabled: toBool(r.enabled),
    lastSyncedBuild: r.lastSyncedBuild,
    lastSyncAt: r.lastSyncAt,
    lastSyncError: r.lastSyncError,
    createdAt: r.createdAt,
    _count: { testCases: r.testCaseCount },
    latestBuild: r.latestBuildId
      ? {
          id: r.latestBuildId,
          number: r.latestBuildNumber,
          result: r.latestBuildResult,
          timestamp: r.latestBuildTimestamp,
          url: r.latestBuildUrl,
          invalid: toBool(r.latestBuildInvalid),
          failureCount: r.latestBuildFailureCount ?? 0,
        }
      : null,
  }));

  return NextResponse.json(jobs);
}

const createJobSchema = z.object({
  name: z.string().trim().min(1),
  jenkinsPath: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = newId();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO Job (id, name, jenkinsPath, enabled, lastSyncedBuild, lastSyncAt, lastSyncError, createdAt)
     VALUES (?, ?, ?, 1, NULL, NULL, NULL, ?)`
  ).run(id, parsed.data.name, parsed.data.jenkinsPath, createdAt);

  return NextResponse.json(
    {
      id,
      name: parsed.data.name,
      jenkinsPath: parsed.data.jenkinsPath,
      enabled: true,
      lastSyncedBuild: null,
      lastSyncAt: null,
      lastSyncError: null,
      createdAt,
    },
    { status: 201 }
  );
}
