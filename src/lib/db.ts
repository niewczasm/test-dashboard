import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function resolvePath(): string {
  const raw = process.env.DATABASE_URL || "file:./data/dev.db";
  return raw.startsWith("file:") ? raw.slice("file:".length) : raw;
}

const dbPath = resolvePath();
if (dbPath !== ":memory:") {
  mkdirSync(dirname(dbPath), { recursive: true });
}

const globalForDb = globalThis as unknown as { db: DatabaseSync | undefined };

export const db = globalForDb.db ?? new DatabaseSync(dbPath);

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

// Next.js's build step loads this module from several separate processes at
// once to inspect each route; without a busy timeout their concurrent first
// CREATE TABLE statements race and SQLite throws "database is locked"
// instead of just waiting its turn.
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS Job (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    jenkinsPath TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    lastSyncedBuild INTEGER,
    lastSyncAt TEXT,
    lastSyncError TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Build (
    id TEXT PRIMARY KEY,
    jobId TEXT NOT NULL REFERENCES Job(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    result TEXT,
    timestamp TEXT NOT NULL,
    url TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    invalid INTEGER NOT NULL DEFAULT 0,
    invalidReason TEXT,
    invalidAt TEXT,
    UNIQUE (jobId, number)
  );
  CREATE INDEX IF NOT EXISTS idx_build_job_timestamp ON Build (jobId, timestamp);

  CREATE TABLE IF NOT EXISTS TestCase (
    id TEXT PRIMARY KEY,
    jobId TEXT NOT NULL REFERENCES Job(id) ON DELETE CASCADE,
    className TEXT NOT NULL,
    testName TEXT NOT NULL,
    firstSeen TEXT NOT NULL,
    lastSeen TEXT NOT NULL,
    UNIQUE (jobId, className, testName)
  );
  CREATE INDEX IF NOT EXISTS idx_testcase_job ON TestCase (jobId);

  CREATE TABLE IF NOT EXISTS TestFailure (
    id TEXT PRIMARY KEY,
    testCaseId TEXT NOT NULL REFERENCES TestCase(id) ON DELETE CASCADE,
    buildId TEXT NOT NULL REFERENCES Build(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    errorMessage TEXT,
    stackTrace TEXT,
    stdout TEXT,
    stderr TEXT,
    duration REAL,
    createdAt TEXT NOT NULL,
    UNIQUE (testCaseId, buildId)
  );
  CREATE INDEX IF NOT EXISTS idx_failure_testcase ON TestFailure (testCaseId);
  CREATE INDEX IF NOT EXISTS idx_failure_build ON TestFailure (buildId);

  CREATE TABLE IF NOT EXISTS Ticket (
    id TEXT PRIMARY KEY,
    testCaseId TEXT NOT NULL UNIQUE REFERENCES TestCase(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    url TEXT,
    note TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    jiraStatus TEXT,
    jiraStatusCategory TEXT,
    jiraCheckedAt TEXT,
    jiraError TEXT
  );

  CREATE TABLE IF NOT EXISTS Tag (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#64748b',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS TagOnTestCase (
    testCaseId TEXT NOT NULL REFERENCES TestCase(id) ON DELETE CASCADE,
    tagId TEXT NOT NULL REFERENCES Tag(id) ON DELETE CASCADE,
    assignedAt TEXT NOT NULL,
    PRIMARY KEY (testCaseId, tagId)
  );

  CREATE TABLE IF NOT EXISTS SyncLog (
    id TEXT PRIMARY KEY,
    jobId TEXT NOT NULL REFERENCES Job(id) ON DELETE CASCADE,
    startedAt TEXT NOT NULL,
    finishedAt TEXT NOT NULL,
    success INTEGER NOT NULL,
    message TEXT NOT NULL,
    newBuilds INTEGER NOT NULL DEFAULT 0,
    newFailures INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_synclog_job_time ON SyncLog (jobId, startedAt);
`);

/**
 * `CREATE TABLE IF NOT EXISTS` only helps on a fresh database — it's a
 * no-op against a table that already exists from an older version of this
 * app, so new columns need an explicit ALTER TABLE (SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, hence the manual existence check).
 *
 * The check-then-add isn't atomic across connections, and Next.js's build
 * step imports this module from many separate worker processes at once —
 * two of them can both see the column missing and both try to add it. The
 * loser isn't wrong, it's just late, so swallow exactly that outcome.
 */
function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("duplicate column name")) {
      throw err;
    }
  }
}

ensureColumn("TestFailure", "stdout", "TEXT");
ensureColumn("TestFailure", "stderr", "TEXT");
ensureColumn("Build", "invalid", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("Build", "invalidReason", "TEXT");
ensureColumn("Build", "invalidAt", "TEXT");
ensureColumn("Ticket", "jiraStatus", "TEXT");
ensureColumn("Ticket", "jiraStatusCategory", "TEXT");
ensureColumn("Ticket", "jiraCheckedAt", "TEXT");
ensureColumn("Ticket", "jiraError", "TEXT");

/** The subset of SQLite bind-parameter types this app actually uses. */
export type SqlParam = string | number | null;

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toBool(value: unknown): boolean {
  return value === 1 || value === true;
}

/** Builds a `column IN (?, ?, ...)` placeholder list for a dynamic-length array. */
export function inPlaceholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}
