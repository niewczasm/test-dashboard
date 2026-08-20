import { NextRequest, NextResponse } from "next/server";
import { db, newId, nowIso } from "@/lib/db";
import { z } from "zod";

const ticketSchema = z.object({
  key: z.string().trim().min(1),
  url: z.string().trim().url().optional().or(z.literal("")).optional(),
  note: z.string().trim().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: testCaseId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ticketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { key, url, note } = parsed.data;
  const now = nowIso();

  const ticket = db
    .prepare(
      `INSERT INTO Ticket (id, testCaseId, key, url, note, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (testCaseId) DO UPDATE SET
         key = excluded.key, url = excluded.url, note = excluded.note, updatedAt = excluded.updatedAt
       RETURNING *`
    )
    .get(newId(), testCaseId, key, url || null, note || null, now, now);

  return NextResponse.json(ticket);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: testCaseId } = await params;
  db.prepare("DELETE FROM Ticket WHERE testCaseId = ?").run(testCaseId);
  return NextResponse.json({ ok: true });
}
