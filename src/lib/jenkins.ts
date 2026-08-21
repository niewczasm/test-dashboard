const JENKINS_URL = process.env.JENKINS_URL?.replace(/\/+$/, "") ?? "";
const JENKINS_USER = process.env.JENKINS_USER ?? "";
const JENKINS_API_TOKEN = process.env.JENKINS_API_TOKEN ?? "";

function authHeader(): Record<string, string> {
  if (!JENKINS_USER || !JENKINS_API_TOKEN) return {};
  const token = Buffer.from(`${JENKINS_USER}:${JENKINS_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

/** Thrown for a non-2xx Jenkins response, carrying the status so callers can
 *  tell "genuinely doesn't exist" (404) apart from a real failure worth
 *  retrying (5xx, auth, etc.) instead of treating every non-ok response the
 *  same way. */
export class JenkinsHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "JenkinsHttpError";
  }
}

async function jenkinsFetch<T>(path: string): Promise<T> {
  if (!JENKINS_URL) {
    throw new Error("JENKINS_URL is not configured (see .env)");
  }
  const res = await fetch(`${JENKINS_URL}${path}`, {
    headers: { ...authHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new JenkinsHttpError(
      `Jenkins request failed (${res.status} ${res.statusText}): ${path}`,
      res.status
    );
  }
  return res.json() as Promise<T>;
}

/** Builds the Jenkins job API path, supporting nested folders like "team/subfolder/job-name". */
function jobApiPath(jenkinsPath: string): string {
  const segments = jenkinsPath.split("/").filter(Boolean);
  return "/" + segments.map((s) => `job/${encodeURIComponent(s)}`).join("/");
}

export interface JenkinsBuildSummary {
  number: number;
  result: string | null;
  timestamp: number;
  url: string;
}

const BUILD_PAGE_SIZE = 100;
// Not a "recent builds" cap — a runaway-request guard in case a Jenkins
// instance is misconfigured to keep an unbounded number of builds. Fetching
// this many would already mean thousands of individual testReport requests
// during sync, so this ceiling is generous, not tight.
const MAX_BUILDS_SAFETY_CAP = 5000;

/**
 * Fetches every build Jenkins still has for this job (walking pages of
 * `BUILD_PAGE_SIZE` via the `{start,end}` tree range syntax), not just the
 * most recent ones — sync.ts relies on seeing the full history on a job's
 * first sync, since after that it only looks for build numbers newer than
 * whatever it saw last time.
 */
export async function fetchRecentBuilds(jenkinsPath: string): Promise<JenkinsBuildSummary[]> {
  const all: JenkinsBuildSummary[] = [];
  let start = 0;
  while (all.length < MAX_BUILDS_SAFETY_CAP) {
    const end = start + BUILD_PAGE_SIZE;
    const data = await jenkinsFetch<{ builds: JenkinsBuildSummary[] }>(
      `${jobApiPath(jenkinsPath)}/api/json?tree=builds[number,result,timestamp,url]{${start},${end}}`
    );
    const page = data.builds ?? [];
    all.push(...page);
    if (page.length < BUILD_PAGE_SIZE) break; // fewer than a full page = end of Jenkins' history
    start = end;
  }
  return all;
}

interface JenkinsTestCase {
  className: string;
  name: string;
  status: string;
  errorDetails?: string | null;
  errorStackTrace?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  duration?: number;
}

interface JenkinsTestSuite {
  cases: JenkinsTestCase[];
}

interface JenkinsTestReport {
  suites?: JenkinsTestSuite[];
}

export interface ParsedTestFailure {
  className: string;
  testName: string;
  status: string;
  errorMessage: string | null;
  stackTrace: string | null;
  stdout: string | null;
  stderr: string | null;
  duration: number | null;
}

const FAILURE_STATUSES = new Set(["FAILED", "REGRESSION"]);

export async function fetchFailingTests(
  jenkinsPath: string,
  buildNumber: number
): Promise<ParsedTestFailure[]> {
  let report: JenkinsTestReport;
  try {
    report = await jenkinsFetch<JenkinsTestReport>(
      `${jobApiPath(jenkinsPath)}/${buildNumber}/testReport/api/json`
    );
  } catch (err) {
    // A 404 genuinely means "no test report published for this build" (e.g.
    // it failed before tests ran) — that's a real, permanent "no failures".
    // Anything else (network blip, Jenkins 5xx, auth trouble, timeout) is
    // NOT the same thing and must not be treated as "no failures", or
    // sync.ts will mark the build as fully synced and permanently lose
    // whatever it actually failed on — let it propagate so the caller
    // retries this build on the next sync instead.
    if (err instanceof JenkinsHttpError && err.status === 404) {
      return [];
    }
    throw err;
  }

  const failures: ParsedTestFailure[] = [];
  for (const suite of report.suites ?? []) {
    for (const testCase of suite.cases ?? []) {
      if (!FAILURE_STATUSES.has(testCase.status)) continue;
      failures.push({
        className: testCase.className,
        testName: testCase.name,
        status: testCase.status,
        errorMessage: testCase.errorDetails ?? null,
        stackTrace: testCase.errorStackTrace ?? null,
        stdout: testCase.stdout || null,
        stderr: testCase.stderr || null,
        duration: typeof testCase.duration === "number" ? testCase.duration : null,
      });
    }
  }
  return failures;
}

export function isJenkinsConfigured(): boolean {
  return Boolean(JENKINS_URL);
}
