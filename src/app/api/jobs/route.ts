import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const jobs = await prisma.job.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { testCases: true } },
    },
  });
  return NextResponse.json(jobs);
}

const createJobSchema = z.object({
  name: z.string().trim().min(1),
  jenkinsPath: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const job = await prisma.job.create({ data: parsed.data });
  return NextResponse.json(job, { status: 201 });
}
