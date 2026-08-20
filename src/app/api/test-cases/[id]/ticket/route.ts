import { NextRequest, NextResponse } from "next/server";
import { db, newId, nowIso } from "@/lib/db";
import { buildTicketUrl } from "@/lib/jira";
import { syncTicketStatus } from "@/lib/jiraSync";
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
  const { key, note } = parsed.data;
  // If the caller didn't paste an explicit link, derive one from JIRA_URL so
  // the ticket key is still clickable.
  const url = parsed.data.url || buildTicketUrl(key);
  const now = nowIso();

  const ticket = db
    .prepare(
      `INSERT INTO Ticket (id, testCaseId, key, url, note, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (testCaseId) DO UPDATE SET
         key = excluded.key, url = excluded.url, note = excluded.note, updatedAt = excluded.updatedAt
       RETURNING *`
    )
    .get(newId(), testCaseId, key, url, note || null, now, now) as { id: string };

  // Best-effort — a slow/unreachable JIRA shouldn't block saving the ticket.
  await syncTicketStatus(ticket.id).catch(() => {});

  const saved = db.prepare("SELECT * FROM Ticket WHERE id = ?").get(ticket.id);
  return NextResponse.json(saved);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: testCaseId } = await params;
  db.prepare("DELETE FROM Ticket WHERE testCaseId = ?").run(testCaseId);
  return NextResponse.json({ ok: true });
}
