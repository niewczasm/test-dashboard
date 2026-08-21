const JIRA_URL = process.env.JIRA_URL?.replace(/\/+$/, "") ?? "";
const JIRA_USER = process.env.JIRA_USER ?? "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN ?? "";

function authHeader(): Record<string, string> {
  // Credentials are optional — many JIRA instances allow anonymous browsing.
  if (!JIRA_USER || !JIRA_API_TOKEN) return {};
  const token = Buffer.from(`${JIRA_USER}:${JIRA_API_TOKEN}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

export function isJiraConfigured(): boolean {
  return Boolean(JIRA_URL);
}

/** `PROJ-123` -> `https://jira.example.com/browse/PROJ-123`, or null if JIRA_URL isn't set. */
export function buildTicketUrl(key: string): string | null {
  if (!JIRA_URL) return null;
  return `${JIRA_URL}/browse/${encodeURIComponent(key)}`;
}

export interface JiraIssueStatus {
  status: string;
  /** JIRA's cross-workflow bucket for the status: "new" | "indeterminate" | "done". */
  statusCategory: string;
  /** ISO timestamp the issue was resolved, or null if it never was (or isn't anymore). */
  resolvedAt: string | null;
  /** Issue title, or null if JIRA didn't return one. */
  summary: string | null;
  /** Assignee's display name, or null if unassigned. */
  assignee: string | null;
}

interface JiraIssueResponse {
  fields?: {
    status?: {
      name?: string;
      statusCategory?: { key?: string };
    };
    resolutiondate?: string | null;
    summary?: string | null;
    assignee?: { displayName?: string | null } | null;
  };
}

export async function fetchIssueStatus(key: string): Promise<JiraIssueStatus> {
  if (!JIRA_URL) {
    throw new Error("JIRA_URL is not configured (see .env)");
  }
  const res = await fetch(
    `${JIRA_URL}/rest/api/2/issue/${encodeURIComponent(key)}?fields=status,resolutiondate,summary,assignee`,
    { headers: { ...authHeader(), Accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(`JIRA request failed (${res.status} ${res.statusText}) for ${key}`);
  }
  const data = (await res.json()) as JiraIssueResponse;
  const status = data.fields?.status?.name;
  const statusCategory = data.fields?.status?.statusCategory?.key;
  if (!status || !statusCategory) {
    throw new Error(`JIRA response for ${key} did not include a status`);
  }
  const rawResolvedAt = data.fields?.resolutiondate;
  const resolvedAt = rawResolvedAt ? new Date(rawResolvedAt).toISOString() : null;
  const summary = data.fields?.summary ?? null;
  const assignee = data.fields?.assignee?.displayName ?? null;
  return { status, statusCategory, resolvedAt, summary, assignee };
}
