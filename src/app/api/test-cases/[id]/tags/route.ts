import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const addTagSchema = z.object({
  tagId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  color: z.string().trim().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: testCaseId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addTagSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.tagId && !parsed.data.name)) {
    return NextResponse.json({ error: "tagId or name is required" }, { status: 400 });
  }

  const tag = parsed.data.tagId
    ? await prisma.tag.findUniqueOrThrow({ where: { id: parsed.data.tagId } })
    : await prisma.tag.upsert({
        where: { name: parsed.data.name! },
        create: { name: parsed.data.name!, color: parsed.data.color || undefined },
        update: {},
      });

  await prisma.tagOnTestCase.upsert({
    where: { testCaseId_tagId: { testCaseId, tagId: tag.id } },
    create: { testCaseId, tagId: tag.id },
    update: {},
  });

  return NextResponse.json(tag, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: testCaseId } = await params;
  const tagId = req.nextUrl.searchParams.get("tagId");
  if (!tagId) {
    return NextResponse.json({ error: "tagId query param is required" }, { status: 400 });
  }
  await prisma.tagOnTestCase.delete({ where: { testCaseId_tagId: { testCaseId, tagId } } });
  return NextResponse.json({ ok: true });
}
