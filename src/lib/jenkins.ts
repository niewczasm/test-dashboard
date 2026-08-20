const JENKINS_URL = process.env.JENKINS_URL?.replace(/\/+$/, "") ?? "";
const JENKINS_USER = process.env.JENKINS_USER ?? "";
const JENKINS_API_TOKEN = process.env.JENKINS_API_TOKEN ?? "";

function authHeader(): Record<string, string> {
  if (!JENKINS_USER || !JENKINS_API_TOKEN) return {};
  const token = Buffer.from(`${JENKINS_USER}:${JENKINS_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}` };
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
    throw new Error(`Jenkins request failed (${res.status} ${res.statusText}): ${path}`);
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

export async function fetchRecentBuilds(
  jenkinsPath: string,
  limit = 25
): Promise<JenkinsBuildSummary[]> {
  const data = await jenkinsFetch<{ builds: JenkinsBuildSummary[] }>(
    `${jobApiPath(jenkinsPath)}/api/json?tree=builds[number,result,timestamp,url]{0,${limit}}`
  );
  return data.builds ?? [];
}

interface JenkinsTestCase {
  className: string;
  name: string;
  status: string;
  errorDetails?: string | null;
  errorStackTrace?: string | null;
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
  } catch {
    // No test report published for this build (e.g. build failed before tests ran).
    return [];
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
        duration: typeof testCase.duration === "number" ? testCase.duration : null,
      });
    }
  }
  return failures;
}

export function isJenkinsConfigured(): boolean {
  return Boolean(JENKINS_URL);
}
