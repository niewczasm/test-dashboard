import { NextRequest, NextResponse } from "next/server";
import { db, newId, nowIso } from "@/lib/db";
import { z } from "zod";

interface TagRow {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  testCaseCount: number;
}

export async function GET() {
  const rows = db
    .prepare(
      `SELECT tg.*, (SELECT COUNT(*) FROM TagOnTestCase WHERE tagId = tg.id) AS testCaseCount
       FROM Tag tg
       ORDER BY tg.name ASC`
    )
    .all() as unknown as TagRow[];

  const tags = rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: r.createdAt,
    _count: { testCases: r.testCaseCount },
  }));

  return NextResponse.json(tags);
}

const createTagSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = newId();
  const createdAt = nowIso();
  const color = parsed.data.color || "#64748b";
  db.prepare("INSERT INTO Tag (id, name, color, createdAt) VALUES (?, ?, ?, ?)").run(
    id,
    parsed.data.name,
    color,
    createdAt
  );

  return NextResponse.json({ id, name: parsed.data.name, color, createdAt }, { status: 201 });
}
