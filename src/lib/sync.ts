import { prisma } from "@/lib/prisma";
import { fetchFailingTests, fetchRecentBuilds } from "@/lib/jenkins";

export interface JobSyncResult {
  jobId: string;
  jobName: string;
  newBuilds: number;
  newFailures: number;
  error: string | null;
}

/** Pulls recent builds for one job, stores newly-seen builds and their failing tests. */
export async function syncJob(jobId: string): Promise<JobSyncResult> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const result: JobSyncResult = {
    jobId: job.id,
    jobName: job.name,
    newBuilds: 0,
    newFailures: 0,
    error: null,
  };

  try {
    const builds = await fetchRecentBuilds(job.jenkinsPath, 25);
    const known = job.lastSyncedBuild ?? 0;
    const toProcess = builds
      .filter((b) => b.number > known && b.result !== null)
      .sort((a, b) => a.number - b.number);

    let highestProcessed = known;

    for (const build of toProcess) {
      const failures = await fetchFailingTests(job.jenkinsPath, build.number);

      const savedBuild = await prisma.build.upsert({
        where: { jobId_number: { jobId: job.id, number: build.number } },
        create: {
          jobId: job.id,
          number: build.number,
          result: build.result,
          timestamp: new Date(build.timestamp),
          url: build.url,
        },
        update: {
          result: build.result,
        },
      });
      result.newBuilds += 1;

      for (const failure of failures) {
        const testCase = await prisma.testCase.upsert({
          where: {
            jobId_className_testName: {
              jobId: job.id,
              className: failure.className,
              testName: failure.testName,
            },
          },
          create: {
            jobId: job.id,
            className: failure.className,
            testName: failure.testName,
          },
          update: { lastSeen: new Date() },
        });

        await prisma.testFailure.upsert({
          where: {
            testCaseId_buildId: { testCaseId: testCase.id, buildId: savedBuild.id },
          },
          create: {
            testCaseId: testCase.id,
            buildId: savedBuild.id,
            status: failure.status,
            errorMessage: failure.errorMessage,
            stackTrace: failure.stackTrace,
            duration: failure.duration,
          },
          update: {},
        });
        result.newFailures += 1;
      }

      highestProcessed = build.number;
    }

    await prisma.job.update({
      where: { id: job.id },
      data: {
        lastSyncedBuild: highestProcessed,
        lastSyncAt: new Date(),
        lastSyncError: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    await prisma.job.update({
      where: { id: job.id },
      data: { lastSyncAt: new Date(), lastSyncError: message },
    });
  }

  return result;
}

export async function syncAllJobs(): Promise<JobSyncResult[]> {
  const jobs = await prisma.job.findMany({ where: { enabled: true } });
  const results: JobSyncResult[] = [];
  for (const job of jobs) {
    results.push(await syncJob(job.id));
  }
  return results;
}
