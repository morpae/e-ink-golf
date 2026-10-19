import type { Config } from "@netlify/functions";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { scores } from "../../db/schema.js";

const DAY_RE = /^\d{8}$/;

export default async (req: Request) => {
  if (req.method === "GET") {
    const day = new URL(req.url).searchParams.get("day") ?? "";
    if (!DAY_RE.test(day)) return Response.json({ error: "Invalid day" }, { status: 400 });

    const rows = await db
      .select({ initials: scores.initials, strokes: scores.strokes })
      .from(scores)
      .where(eq(scores.day, day))
      .orderBy(asc(scores.strokes), asc(scores.createdAt))
      .limit(10);
    return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const initials = String(body?.initials ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    const day = String(body?.day ?? "");
    const strokes = Number(body?.strokes);

    if (!initials || !DAY_RE.test(day) || !Number.isInteger(strokes) || strokes < 1 || strokes > 999) {
      return Response.json({ error: "Invalid score" }, { status: 400 });
    }

    // Only accept scores for today or yesterday (client local dates may differ from UTC)
    const now = Date.now();
    const allowed = [-1, 0, 1].map((o) => new Date(now + o * 86400000).toISOString().slice(0, 10).replace(/-/g, ""));
    if (!allowed.includes(day)) return Response.json({ error: "Invalid day" }, { status: 400 });

    const [row] = await db.insert(scores).values({ initials, day, strokes }).returning();
    return Response.json({ id: row.id }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/scores",
};
