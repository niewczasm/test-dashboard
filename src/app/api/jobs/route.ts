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
}

export async function GET() {
  const rows = db
    .prepare(
      `SELECT j.*, (SELECT COUNT(*) FROM TestCase tc WHERE tc.jobId = j.id) AS testCaseCount
       FROM Job j
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
