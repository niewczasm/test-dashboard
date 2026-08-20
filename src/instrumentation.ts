export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const cron = await import("node-cron");
  const { syncAllJobs } = await import("@/lib/sync");
  const { syncAllTicketStatuses } = await import("@/lib/jiraSync");

  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES ?? "15");
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  cron.schedule(`*/${minutes} * * * *`, () => {
    syncAllJobs().catch((err) => {
      console.error("[sync] scheduled sync failed:", err);
    });
    syncAllTicketStatuses().catch((err) => {
      console.error("[jira] scheduled ticket status sync failed:", err);
    });
  });

  console.log(`[sync] scheduled Jenkins sync every ${minutes} minute(s)`);
}
