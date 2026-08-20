import { NextRequest, NextResponse } from "next/server";
import { db, nowIso, toBool } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  invalid: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

interface BuildRow {
  id: string;
  number: number;
  result: string | null;
  timestamp: string;
  url: string;
  invalid: number;
  invalidReason: string | null;
  invalidAt: string | null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.invalid && !parsed.data.reason) {
    return NextResponse.json({ error: "reason is required when marking a build invalid" }, { status: 400 });
  }

  db.prepare(
    `UPDATE Build SET invalid = ?, invalidReason = ?, invalidAt = ? WHERE id = ?`
  ).run(
    parsed.data.invalid ? 1 : 0,
    parsed.data.invalid ? parsed.data.reason || null : null,
    parsed.data.invalid ? nowIso() : null,
    id
  );

  const row = db.prepare("SELECT * FROM Build WHERE id = ?").get(id) as unknown as
    | BuildRow
    | undefined;
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ...row, invalid: toBool(row.invalid) });
}
