import { NextRequest, NextResponse } from "next/server";
import { db, toBool } from "@/lib/db";

interface BuildRow {
  id: string;
  number: number;
  result: string | null;
  timestamp: string;
  url: string;
  invalid: number;
  invalidReason: string | null;
  invalidAt: string | null;
  failureCount: number;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;

  const rows = db
    .prepare(
      `SELECT
         b.id, b.number, b.result, b.timestamp, b.url, b.invalid, b.invalidReason, b.invalidAt,
         (SELECT COUNT(*) FROM TestFailure WHERE buildId = b.id) AS failureCount
       FROM Build b
       WHERE b.jobId = ?
       ORDER BY b.timestamp DESC
       LIMIT 50`
    )
    .all(jobId) as unknown as BuildRow[];

  const builds = rows.map((r) => ({
    id: r.id,
    number: r.number,
    result: r.result,
    timestamp: r.timestamp,
    url: r.url,
    invalid: toBool(r.invalid),
    invalidReason: r.invalidReason,
    invalidAt: r.invalidAt,
    failureCount: r.failureCount,
  }));

  return NextResponse.json(builds);
}
