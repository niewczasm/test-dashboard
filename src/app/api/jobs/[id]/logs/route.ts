import { NextRequest, NextResponse } from "next/server";
import { db, toBool } from "@/lib/db";

interface SyncLogRow {
  id: string;
  startedAt: string;
  finishedAt: string;
  success: number;
  message: string;
  newBuilds: number;
  newFailures: number;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;

  const rows = db
    .prepare(
      `SELECT id, startedAt, finishedAt, success, message, newBuilds, newFailures
       FROM SyncLog
       WHERE jobId = ?
       ORDER BY startedAt DESC
       LIMIT 50`
    )
    .all(jobId) as unknown as SyncLogRow[];

  const logs = rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    success: toBool(r.success),
    message: r.message,
    newBuilds: r.newBuilds,
    newFailures: r.newFailures,
  }));

  return NextResponse.json(logs);
}
