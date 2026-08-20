import { NextRequest, NextResponse } from "next/server";
import { db, toBool, type SqlParam } from "@/lib/db";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const invalidParam = req.nextUrl.searchParams.get("invalid");
  const hasFailuresParam = req.nextUrl.searchParams.get("hasFailures");
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? "25") || 25)
  );

  const conditions: string[] = ["b.jobId = ?"];
  const params_: SqlParam[] = [jobId];

  if (status) {
    conditions.push("b.result = ?");
    params_.push(status);
  }
  if (invalidParam === "true") {
    conditions.push("b.invalid = 1");
  } else if (invalidParam === "false") {
    conditions.push("b.invalid = 0");
  }
  if (hasFailuresParam === "true") {
    conditions.push("EXISTS (SELECT 1 FROM TestFailure WHERE buildId = b.id)");
  } else if (hasFailuresParam === "false") {
    conditions.push("NOT EXISTS (SELECT 1 FROM TestFailure WHERE buildId = b.id)");
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM Build b ${where}`).get(...params_) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT
         b.id, b.number, b.result, b.timestamp, b.url, b.invalid, b.invalidReason, b.invalidAt,
         (SELECT COUNT(*) FROM TestFailure WHERE buildId = b.id) AS failureCount
       FROM Build b
       ${where}
       ORDER BY b.timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params_, pageSize, (page - 1) * pageSize) as unknown as BuildRow[];

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

  return NextResponse.json({ builds, total, page, pageSize });
}
