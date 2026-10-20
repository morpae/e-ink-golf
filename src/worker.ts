import { drizzle } from "drizzle-orm/d1";
import { asc, eq } from "drizzle-orm";
import { scores } from "../db/schema";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const DAY_RE = /^\d{8}$/;
const TOP_N = 10; // máximo de entradas por día
const MIN_STROKES = 9; // 9 hoyos, mínimo 1 golpe cada uno
const MAX_STROKES = 999;
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

// Se conservan ayer y hoy (con margen de zona horaria): todo lo anterior se borra
function oldestKeptDay(): string {
  return new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
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
      .limit(TOP_N);
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

    // El circuito diario tiene 9 hoyos: menos de 9 golpes es imposible
    if (!initials || !DAY_RE.test(day) || !Number.isInteger(strokes) || strokes < MIN_STROKES || strokes > MAX_STROKES) {
      return json({ error: "Invalid score" }, 400);
    }
    if (!allowedDays().includes(day)) return json({ error: "Invalid day" }, 400);

    const createdAt = Math.floor(Date.now() / 1000);

    // Una sola transacción: insertar, dejar solo el top 10 de ese día y borrar días antiguos
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO scores (initials, day, strokes, created_at) VALUES (?, ?, ?, ?)").bind(
        initials,
        day,
        strokes,
        createdAt
      ),
      env.DB.prepare(
        `DELETE FROM scores WHERE day = ?1 AND id NOT IN (
           SELECT id FROM scores WHERE day = ?1 ORDER BY strokes ASC, created_at ASC, id ASC LIMIT ?2
         )`
      ).bind(day, TOP_N),
      env.DB.prepare("DELETE FROM scores WHERE day < ?").bind(oldestKeptDay()),
    ]);

    const id = results[0].meta.last_row_id;
    const kept = await env.DB.prepare("SELECT 1 AS ok FROM scores WHERE id = ?").bind(id).first();
    return json({ id, ranked: kept !== null }, 201);
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
