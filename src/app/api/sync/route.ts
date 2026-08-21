import { NextRequest, NextResponse } from "next/server";
import { syncAllJobs, syncJob } from "@/lib/sync";
import { isJenkinsConfigured } from "@/lib/jenkins";
import { syncAllTicketStatuses, syncTicketStatusesForJob } from "@/lib/jiraSync";

export async function POST(req: NextRequest) {
  if (!isJenkinsConfigured()) {
    return NextResponse.json(
      { error: "JENKINS_URL is not configured. Set it in .env and restart the server." },
      { status: 400 }
    );
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  const results = jobId ? [await syncJob(jobId)] : await syncAllJobs();

  // Best-effort — a slow/unreachable JIRA shouldn't fail a Jenkins sync that
  // otherwise succeeded (syncTicketStatus already records per-ticket errors
  // rather than throwing, this is just extra insurance).
  try {
    if (jobId) {
      await syncTicketStatusesForJob(jobId);
    } else {
      await syncAllTicketStatuses();
    }
  } catch {
    // ignore — Jenkins sync results above are unaffected
  }

  return NextResponse.json({ results });
}
