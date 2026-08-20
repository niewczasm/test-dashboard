import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isJiraConfigured } from "@/lib/jira";
import { syncTicketStatus } from "@/lib/jiraSync";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isJiraConfigured()) {
    return NextResponse.json({ error: "JIRA_URL is not configured (see .env)" }, { status: 400 });
  }
  await syncTicketStatus(id);
  const ticket = db.prepare("SELECT * FROM Ticket WHERE id = ?").get(id);
  if (!ticket) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(ticket);
}
