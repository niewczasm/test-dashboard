import { db, nowIso } from "@/lib/db";
import { fetchIssueStatus, isJiraConfigured } from "@/lib/jira";

interface TicketRow {
  id: string;
  key: string;
}

/** Refreshes one ticket's cached JIRA status. Safe to call right after a ticket is saved. */
export async function syncTicketStatus(ticketId: string): Promise<void> {
  if (!isJiraConfigured()) return;
  const ticket = db.prepare("SELECT id, key FROM Ticket WHERE id = ?").get(ticketId) as
    | TicketRow
    | undefined;
  if (!ticket) return;

  try {
    const { status, statusCategory, resolvedAt, summary, assignee } = await fetchIssueStatus(
      ticket.key
    );
    db.prepare(
      `UPDATE Ticket SET jiraStatus = ?, jiraStatusCategory = ?, jiraResolvedAt = ?,
         jiraSummary = ?, jiraAssignee = ?, jiraCheckedAt = ?, jiraError = NULL WHERE id = ?`
    ).run(status, statusCategory, resolvedAt, summary, assignee, nowIso(), ticket.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare("UPDATE Ticket SET jiraCheckedAt = ?, jiraError = ? WHERE id = ?").run(
      nowIso(),
      message,
      ticket.id
    );
  }
}

/** Refreshes every ticket's cached JIRA status — run periodically alongside the Jenkins sync. */
export async function syncAllTicketStatuses(): Promise<void> {
  if (!isJiraConfigured()) return;
  const tickets = db.prepare("SELECT id, key FROM Ticket").all() as unknown as TicketRow[];
  for (const ticket of tickets) {
    await syncTicketStatus(ticket.id);
  }
}
