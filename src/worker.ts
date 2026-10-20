import { drizzle } from "drizzle-orm/d1";
import { asc, eq } from "drizzle-orm";
import { scores } from "../db/schema";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const DAY_RE = /^\d{8}$/;
const JSON_HEADERS = { "Cache-Control": "no-store" };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: JSON_HEADERS });
}

// Fechas permitidas: ayer, hoy y mañana en UTC (el cliente usa su hora local)
function allowedDays(): string[] {
  const now = Date.now();
  return [-1, 0, 1].map((o) =>
    new Date(now + o * 86400000).toISOString().slice(0, 10).replace(/-/g, "")
  );
}

async function handleScores(req: Request, env: Env): Promise<Response> {
  const db = drizzle(env.DB);

  if (req.method === "GET") {
    const day = new URL(req.url).searchParams.get("day") ?? "";
    if (!DAY_RE.test(day)) return json({ error: "Invalid day" }, 400);

    const rows = await db
      .select({ initials: scores.initials, strokes: scores.strokes })
      .from(scores)
      .where(eq(scores.day, day))
      .orderBy(asc(scores.strokes), asc(scores.createdAt))
      .limit(10);
    return json(rows);
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const initials = String(body?.initials ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3);
    const day = String(body?.day ?? "");
    const strokes = Number(body?.strokes);

    if (!initials || !DAY_RE.test(day) || !Number.isInteger(strokes) || strokes < 1 || strokes > 999) {
      return json({ error: "Invalid score" }, 400);
    }
    if (!allowedDays().includes(day)) return json({ error: "Invalid day" }, 400);

    const [row] = await db
      .insert(scores)
      .values({ initials, day, strokes, createdAt: new Date() })
      .returning({ id: scores.id });
    return json({ id: row.id }, 201);
  }

  return new Response("Method not allowed", { status: 405 });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/scores") {
      try {
        return await handleScores(req, env);
      } catch (err) {
        console.error("scores error", err);
        return json({ error: "Server error" }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
