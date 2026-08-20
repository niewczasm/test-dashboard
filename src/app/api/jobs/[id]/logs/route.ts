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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? "20") || 20)
  );
  const status = req.nextUrl.searchParams.get("status"); // "ok" | "error" | null

  const where: string[] = ["jobId = ?"];
  const params_: (string | number)[] = [jobId];
  if (status === "ok") {
    where.push("success = 1");
  } else if (status === "error") {
    where.push("success = 0");
  }
  const whereClause = where.join(" AND ");

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM SyncLog WHERE ${whereClause}`).get(...params_) as {
      count: number;
    }
  ).count;

  const rows = db
    .prepare(
      `SELECT id, startedAt, finishedAt, success, message, newBuilds, newFailures
       FROM SyncLog
       WHERE ${whereClause}
       ORDER BY startedAt DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params_, pageSize, (page - 1) * pageSize) as unknown as SyncLogRow[];

  const logs = rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    success: toBool(r.success),
    message: r.message,
    newBuilds: r.newBuilds,
    newFailures: r.newFailures,
  }));

  return NextResponse.json({ logs, total, page, pageSize });
}
