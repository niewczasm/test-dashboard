import { db, newId, nowIso } from "@/lib/db";
import { fetchFailingTests, fetchRecentBuilds } from "@/lib/jenkins";

export interface JobSyncResult {
  jobId: string;
  jobName: string;
  newBuilds: number;
  newFailures: number;
  error: string | null;
}

interface JobRow {
  id: string;
  name: string;
  jenkinsPath: string;
  lastSyncedBuild: number | null;
}

/** Pulls recent builds for one job, stores newly-seen builds and their failing tests. */
export async function syncJob(jobId: string): Promise<JobSyncResult> {
  const job = db
    .prepare("SELECT id, name, jenkinsPath, lastSyncedBuild FROM Job WHERE id = ?")
    .get(jobId) as JobRow | undefined;
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const result: JobSyncResult = {
    jobId: job.id,
    jobName: job.name,
    newBuilds: 0,
    newFailures: 0,
    error: null,
  };

  const upsertBuild = db.prepare(`
    INSERT INTO Build (id, jobId, number, result, timestamp, url, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (jobId, number) DO UPDATE SET result = excluded.result
    RETURNING id
  `);
  const upsertTestCase = db.prepare(`
    INSERT INTO TestCase (id, jobId, className, testName, firstSeen, lastSeen)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (jobId, className, testName) DO UPDATE SET lastSeen = excluded.lastSeen
    RETURNING id
  `);
  const insertFailure = db.prepare(`
    INSERT INTO TestFailure (id, testCaseId, buildId, status, errorMessage, stackTrace, duration, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (testCaseId, buildId) DO NOTHING
  `);

  try {
    const builds = await fetchRecentBuilds(job.jenkinsPath, 25);
    const known = job.lastSyncedBuild ?? 0;
    const toProcess = builds
      .filter((b) => b.number > known && b.result !== null)
      .sort((a, b) => a.number - b.number);

    let highestProcessed = known;

    for (const build of toProcess) {
      const failures = await fetchFailingTests(job.jenkinsPath, build.number);

      const buildRow = upsertBuild.get(
        newId(),
        job.id,
        build.number,
        build.result,
        new Date(build.timestamp).toISOString(),
        build.url,
        nowIso()
      ) as { id: string };
      result.newBuilds += 1;

      for (const failure of failures) {
        const testCaseRow = upsertTestCase.get(
          newId(),
          job.id,
          failure.className,
          failure.testName,
          nowIso(),
          nowIso()
        ) as { id: string };

        insertFailure.run(
          newId(),
          testCaseRow.id,
          buildRow.id,
          failure.status,
          failure.errorMessage,
          failure.stackTrace,
          failure.duration,
          nowIso()
        );
        result.newFailures += 1;
      }

      highestProcessed = build.number;
    }

    db.prepare(
      "UPDATE Job SET lastSyncedBuild = ?, lastSyncAt = ?, lastSyncError = NULL WHERE id = ?"
    ).run(highestProcessed, nowIso(), job.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    db.prepare("UPDATE Job SET lastSyncAt = ?, lastSyncError = ? WHERE id = ?").run(
      nowIso(),
      message,
      job.id
    );
  }

  return result;
}

export async function syncAllJobs(): Promise<JobSyncResult[]> {
  const jobs = db.prepare("SELECT id FROM Job WHERE enabled = 1").all() as { id: string }[];
  const results: JobSyncResult[] = [];
  for (const job of jobs) {
    results.push(await syncJob(job.id));
  }
  return results;
}
