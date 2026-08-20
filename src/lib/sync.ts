import { db, newId, nowIso } from "@/lib/db";
import { fetchFailingTests, fetchRecentBuilds } from "@/lib/jenkins";
import { describeError } from "@/lib/errors";

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

const MAX_LOG_ENTRIES_PER_JOB = 50;

function writeSyncLog(
  jobId: string,
  startedAt: string,
  success: boolean,
  message: string,
  newBuilds: number,
  newFailures: number
) {
  db.prepare(
    `INSERT INTO SyncLog (id, jobId, startedAt, finishedAt, success, message, newBuilds, newFailures)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), jobId, startedAt, nowIso(), success ? 1 : 0, message, newBuilds, newFailures);

  // Keep the log bounded — this is a debugging aid, not an audit trail.
  db.prepare(
    `DELETE FROM SyncLog
     WHERE jobId = ?
       AND id NOT IN (SELECT id FROM SyncLog WHERE jobId = ? ORDER BY startedAt DESC LIMIT ?)`
  ).run(jobId, jobId, MAX_LOG_ENTRIES_PER_JOB);
}

/** Pulls recent builds for one job, stores newly-seen builds and their failing tests. */
export async function syncJob(jobId: string): Promise<JobSyncResult> {
  const startedAt = nowIso();
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
    INSERT INTO TestFailure (id, testCaseId, buildId, status, errorMessage, stackTrace, stdout, stderr, duration, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          failure.stdout,
          failure.stderr,
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

    let message: string;
    if (builds.length === 0) {
      message = "Jenkins returned no builds at all for this job path — double-check the path is correct.";
    } else if (toProcess.length === 0) {
      message = `Up to date — latest known build is #${known}, Jenkins has ${builds.length} recent build(s) but none newer (or still running).`;
    } else {
      message = `Synced ${result.newBuilds} new build(s), found ${result.newFailures} new failure(s).`;
    }
    writeSyncLog(job.id, startedAt, true, message, result.newBuilds, result.newFailures);
  } catch (err) {
    const message = describeError(err);
    result.error = message;
    db.prepare("UPDATE Job SET lastSyncAt = ?, lastSyncError = ? WHERE id = ?").run(
      nowIso(),
      message,
      job.id
    );
    writeSyncLog(job.id, startedAt, false, message, result.newBuilds, result.newFailures);
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
