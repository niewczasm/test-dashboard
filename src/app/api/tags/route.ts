import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { testCases: true } } },
  });
  return NextResponse.json(tags);
}

const createTagSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const tag = await prisma.tag.create({
    data: { name: parsed.data.name, color: parsed.data.color || undefined },
  });
  return NextResponse.json(tag, { status: 201 });
}
