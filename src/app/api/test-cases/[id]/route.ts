import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const testCase = await prisma.testCase.findUnique({
    where: { id },
    include: {
      job: { select: { id: true, name: true, jenkinsPath: true } },
      ticket: true,
      tags: { include: { tag: true } },
      failures: {
        include: { build: true },
        orderBy: { build: { timestamp: "desc" } },
      },
    },
  });
  if (!testCase) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(testCase);
}
