import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface FailureRow {
  testCaseId: string;
  className: string;
  testName: string;
  status: string;
  errorMessage: string | null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: buildId } = await params;

  const rows = db
    .prepare(
      `SELECT tc.id AS testCaseId, tc.className, tc.testName, tf.status, tf.errorMessage
       FROM TestFailure tf
       JOIN TestCase tc ON tc.id = tf.testCaseId
       WHERE tf.buildId = ?
       ORDER BY tc.className, tc.testName`
    )
    .all(buildId) as unknown as FailureRow[];

  return NextResponse.json(rows);
}
