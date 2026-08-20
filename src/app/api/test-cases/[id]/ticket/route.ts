import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  const ticket = await prisma.ticket.upsert({
    where: { testCaseId },
    create: { testCaseId, key, url: url || null, note: note || null },
    update: { key, url: url || null, note: note || null },
  });
  return NextResponse.json(ticket);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: testCaseId } = await params;
  await prisma.ticket.delete({ where: { testCaseId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
