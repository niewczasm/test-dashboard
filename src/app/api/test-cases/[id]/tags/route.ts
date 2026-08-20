import { NextRequest, NextResponse } from "next/server";
import { db, newId, nowIso } from "@/lib/db";
import { z } from "zod";

const addTagSchema = z.object({
  tagId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  color: z.string().trim().optional(),
});

interface TagRow {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: testCaseId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addTagSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.tagId && !parsed.data.name)) {
    return NextResponse.json({ error: "tagId or name is required" }, { status: 400 });
  }

  let tag: TagRow;
  if (parsed.data.tagId) {
    const existing = db.prepare("SELECT * FROM Tag WHERE id = ?").get(parsed.data.tagId) as unknown as
      | TagRow
      | undefined;
    if (!existing) {
      return NextResponse.json({ error: "tag not found" }, { status: 404 });
    }
    tag = existing;
  } else {
    tag = db
      .prepare(
        `INSERT INTO Tag (id, name, color, createdAt) VALUES (?, ?, ?, ?)
         ON CONFLICT (name) DO UPDATE SET name = excluded.name
         RETURNING *`
      )
      .get(newId(), parsed.data.name!, parsed.data.color || "#64748b", nowIso()) as unknown as TagRow;
  }

  db.prepare(
    `INSERT INTO TagOnTestCase (testCaseId, tagId, assignedAt) VALUES (?, ?, ?)
     ON CONFLICT (testCaseId, tagId) DO NOTHING`
  ).run(testCaseId, tag.id, nowIso());

  return NextResponse.json(tag, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: testCaseId } = await params;
  const tagId = req.nextUrl.searchParams.get("tagId");
  if (!tagId) {
    return NextResponse.json({ error: "tagId query param is required" }, { status: 400 });
  }
  db.prepare("DELETE FROM TagOnTestCase WHERE testCaseId = ? AND tagId = ?").run(testCaseId, tagId);
  return NextResponse.json({ ok: true });
}
