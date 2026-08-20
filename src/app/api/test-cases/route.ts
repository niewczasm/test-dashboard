import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId") ?? undefined;
  const tagId = req.nextUrl.searchParams.get("tagId") ?? undefined;
  const hasTicket = req.nextUrl.searchParams.get("hasTicket");
  const search = req.nextUrl.searchParams.get("q")?.trim();

  const testCases = await prisma.testCase.findMany({
    where: {
      jobId,
      tags: tagId ? { some: { tagId } } : undefined,
      ticket:
        hasTicket === "true" ? { isNot: null } : hasTicket === "false" ? { is: null } : undefined,
      OR: search
        ? [
            { className: { contains: search } },
            { testName: { contains: search } },
          ]
        : undefined,
    },
    include: {
      job: { select: { id: true, name: true } },
      ticket: true,
      tags: { include: { tag: true } },
      _count: { select: { failures: true } },
    },
    orderBy: { lastSeen: "desc" },
  });

  return NextResponse.json(testCases);
}
