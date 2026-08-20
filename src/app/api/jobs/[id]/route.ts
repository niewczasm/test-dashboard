import { NextRequest, NextResponse } from "next/server";
import { db, toBool, type SqlParam } from "@/lib/db";
import { z } from "zod";

const updateJobSchema = z.object({
  name: z.string().trim().min(1).optional(),
  jenkinsPath: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
});

interface JobRow {
  id: string;
  name: string;
  jenkinsPath: string;
  enabled: number;
  lastSyncedBuild: number | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const sets: string[] = [];
  const values: SqlParam[] = [];
  if (parsed.data.name !== undefined) {
    sets.push("name = ?");
    values.push(parsed.data.name);
  }
  if (parsed.data.jenkinsPath !== undefined) {
    sets.push("jenkinsPath = ?");
    values.push(parsed.data.jenkinsPath);
  }
  if (parsed.data.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(parsed.data.enabled ? 1 : 0);
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE Job SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  }

  const row = db.prepare("SELECT * FROM Job WHERE id = ?").get(id) as unknown as JobRow | undefined;
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ...row, enabled: toBool(row.enabled) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.prepare("DELETE FROM Job WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
