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
  ticket: { key: string; url: string | null } | null;
  tags: { id: string; name: string; color: string }[];
}

export interface StatsDto {
  windowDays: number;
  totalFailures: number;
  uniqueFailingTests: number;
  topFailingTests: TopFailingTestDto[];
  failuresByJob: { jobName: string; count: number }[];
  failuresOverTime: { date: string; count: number }[];
}
