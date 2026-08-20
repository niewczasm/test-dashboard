import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays } from "date-fns";

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? "30");
  const jobId = req.nextUrl.searchParams.get("jobId") ?? undefined;
  const since = subDays(new Date(), Number.isFinite(days) && days > 0 ? days : 30);

  const failures = await prisma.testFailure.findMany({
    where: {
      build: { timestamp: { gte: since } },
      testCase: jobId ? { jobId } : undefined,
    },
    include: {
      testCase: {
        include: {
          job: { select: { id: true, name: true } },
          ticket: true,
          tags: { include: { tag: true } },
        },
      },
      build: { select: { number: true, timestamp: true } },
    },
    orderBy: { build: { timestamp: "asc" } },
  });

  const byTestCase = new Map<
    string,
    {
      testCaseId: string;
      className: string;
      testName: string;
      jobId: string;
      jobName: string;
      failureCount: number;
      lastFailedAt: string;
      ticket: { key: string; url: string | null } | null;
      tags: { id: string; name: string; color: string }[];
    }
  >();
  const byJob = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const f of failures) {
    const tc = f.testCase;
    const key = tc.id;
    const existing = byTestCase.get(key);
    if (existing) {
      existing.failureCount += 1;
      if (f.build.timestamp.toISOString() > existing.lastFailedAt) {
        existing.lastFailedAt = f.build.timestamp.toISOString();
      }
    } else {
      byTestCase.set(key, {
        testCaseId: tc.id,
        className: tc.className,
        testName: tc.testName,
        jobId: tc.job.id,
        jobName: tc.job.name,
        failureCount: 1,
        lastFailedAt: f.build.timestamp.toISOString(),
        ticket: tc.ticket ? { key: tc.ticket.key, url: tc.ticket.url } : null,
        tags: tc.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
      });
    }

    byJob.set(tc.job.name, (byJob.get(tc.job.name) ?? 0) + 1);

    const day = f.build.timestamp.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const topFailingTests = [...byTestCase.values()].sort((a, b) => b.failureCount - a.failureCount);
  const failuresByJob = [...byJob.entries()]
    .map(([name, count]) => ({ jobName: name, count }))
    .sort((a, b) => b.count - a.count);
  const failuresOverTime = [...byDay.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    windowDays: days,
    totalFailures: failures.length,
    uniqueFailingTests: byTestCase.size,
    topFailingTests,
    failuresByJob,
    failuresOverTime,
  });
}
