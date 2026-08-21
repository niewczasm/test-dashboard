export interface JobDto {
  id: string;
  name: string;
  jenkinsPath: string;
  enabled: boolean;
  lastSyncedBuild: number | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  _count: { testCases: number };
  latestBuild: {
    id: string;
    number: number;
    result: string | null;
    timestamp: string;
    url: string;
    invalid: boolean;
    failureCount: number;
  } | null;
}

export interface SyncLogDto {
  id: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  message: string;
  newBuilds: number;
  newFailures: number;
}

export interface SyncLogsResponseDto {
  logs: SyncLogDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TagDto {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  _count?: { testCases: number };
}

export interface TicketDto {
  id: string;
  testCaseId: string;
  key: string;
  url: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  jiraStatus: string | null;
  jiraStatusCategory: string | null;
  jiraResolvedAt: string | null;
  jiraCheckedAt: string | null;
  jiraError: string | null;
}

export interface TestCaseListDto {
  id: string;
  jobId: string;
  className: string;
  testName: string;
  firstSeen: string;
  lastSeen: string;
  job: { id: string; name: string };
  ticket: TicketDto | null;
  tags: { tag: TagDto }[];
  _count: { failures: number };
}

export interface BuildDto {
  id: string;
  number: number;
  result: string | null;
  timestamp: string;
  url: string;
  invalid: boolean;
  invalidReason: string | null;
}

export interface JobBuildDto {
  id: string;
  number: number;
  result: string | null;
  timestamp: string;
  url: string;
  invalid: boolean;
  invalidReason: string | null;
  invalidAt: string | null;
  failureCount: number;
}

export interface JobBuildsResponseDto {
  builds: JobBuildDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BuildFailureDto {
  testCaseId: string;
  className: string;
  testName: string;
  status: string;
  errorMessage: string | null;
}

export interface TestFailureDto {
  id: string;
  status: string;
  errorMessage: string | null;
  stackTrace: string | null;
  stdout: string | null;
  stderr: string | null;
  duration: number | null;
  /** Approximate actual failure moment (build start + this test's duration), not the build's start time. */
  failedAt: string;
  createdAt: string;
  build: BuildDto;
}

export interface TestCaseDetailDto {
  id: string;
  jobId: string;
  className: string;
  testName: string;
  firstSeen: string;
  lastSeen: string;
  job: { id: string; name: string; jenkinsPath: string };
  ticket: TicketDto | null;
  /** True only when the test failed (in a non-invalidated build) after the ticket's JIRA resolution date. */
  ticketRegressedAfterFix: boolean;
  tags: { tag: TagDto }[];
  failures: TestFailureDto[];
}

export interface TopFailingTestDto {
  testCaseId: string;
  className: string;
  testName: string;
  jobId: string;
  jobName: string;
  failureCount: number;
  lastFailedAt: string;
  ticket: {
    key: string;
    url: string | null;
    jiraStatus: string | null;
    jiraStatusCategory: string | null;
  } | null;
  /** True only when the test failed (in a non-invalidated build) after the ticket's JIRA resolution date. */
  ticketRegressedAfterFix: boolean;
  tags: { id: string; name: string; color: string }[];
}

export interface TrendTagDto {
  id: string;
  name: string;
  color: string;
}

export interface FailuresOverTimePointDto {
  date: string;
  total: number;
  /** tagId -> failure count on this day, keyed for every tag in `StatsDto.trendTags`. */
  tagCounts: Record<string, number>;
}

export interface StatsDto {
  windowDays: number | null;
  /** Only set in "all time" mode: the oldest build's timestamp, i.e. what "since" actually resolved to. */
  sinceDate: string | null;
  totalFailures: number;
  uniqueFailingTests: number;
  topFailingTests: TopFailingTestDto[];
  failuresByJob: { jobName: string; count: number }[];
  /** Zero-filled per day, but only from the oldest known build onward — not necessarily the full requested window. */
  failuresOverTime: FailuresOverTimePointDto[];
  /** Tags actually present among the counted failures, most-frequent first (capped). */
  trendTags: TrendTagDto[];
}
