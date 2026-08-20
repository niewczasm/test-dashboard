import { NextRequest, NextResponse } from "next/server";
import { syncAllJobs, syncJob } from "@/lib/sync";
import { isJenkinsConfigured } from "@/lib/jenkins";

export async function POST(req: NextRequest) {
  if (!isJenkinsConfigured()) {
    return NextResponse.json(
      { error: "JENKINS_URL is not configured. Set it in .env and restart the server." },
      { status: 400 }
    );
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  const results = jobId ? [await syncJob(jobId)] : await syncAllJobs();
  return NextResponse.json({ results });
}
