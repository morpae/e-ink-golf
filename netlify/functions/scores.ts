import { Context } from "@netlify/functions";
import { db } from "@netlify/database";
import { pgTable, text, integer, serial } from "drizzle-orm/pg-core";
import { eq, desc, and } from "drizzle-orm";

// Tabla de puntuaciones en Postgres con Drizzle
export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  initials: text("initials").notNull(),
  day: text("day").notNull(),
  strokes: integer("strokes").notNull(),
});

// Mapa en memoria para Rate Limiting (Máx 3 envíos cada 5 minutos por IP)
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const MAX_REQUESTS = 3;           // 3 peticiones máximo por ventana

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const userRecord = rateLimitMap.get(ip);

  if (!userRecord) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return false;
  }

  if (now - userRecord.lastReset > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, lastReset: now });
    return false;
  }

  if (userRecord.count >= MAX_REQUESTS) {
    return true;
  }

  userRecord.count++;
  return false;
}

export default async (req: Request, context: Context) => {
  // Manejo de peticiones GET (Consultar el Top 10 del día)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const day = url.searchParams.get("day");

    if (!day || !/^\d{8}$/.test(day)) {
      return new Response(JSON.stringify({ error: "Parámetro 'day' inválido (formato YYYYMMDD)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const topScores = await db
        .select({
          initials: scores.initials,
          strokes: scores.strokes,
        })
        .from(scores)
        .where(eq(scores.day, day))
        .orderBy(scores.strokes)
        .limit(10);

      return new Response(JSON.stringify(topScores), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    } catch (err: any) {
      console.error("Error al consultar puntuaciones:", err);
      return new Response(JSON.stringify({ error: "Error de servidor al leer datos" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // Manejo de peticiones POST (Guardar nuevo récord)
  if (req.method === "POST") {
    const clientIP = req.headers.get("x-nf-client-connection-ip") || req.headers.get("client-ip") || "unknown";

    // 1. Aplicar Rate Limit por IP
    if (isRateLimited(clientIP)) {
      return new Response(JSON.stringify({ error: "Demasiadas peticiones. Inténtalo de nuevo en unos minutos." }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const body = await req.json();
      let { initials, day, strokes } = body;

      // 2. Validación estricta de iniciales (solo A-Z, máximo 3 caracteres)
      if (!initials || typeof initials !== "string") {
        initials = "AAA";
      }
      initials = initials.trim().toUpperCase().replace(/[^A-Z]/g, "").substring(0, 3) || "AAA";

      // 3. Validación estricta del número de golpes (rango lógico para 8 hoyos: entre 8 y 120)
      const strokeVal = parseInt(strokes, 10);
      if (isNaN(strokeVal) || strokeVal < 8 || strokeVal > 120) {
        return new Response(JSON.stringify({ error: "Número de golpes no válido (debe estar entre 8 y 120)" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 4. Validación del formato de fecha (YYYYMMDD)
      if (!day || !/^\d{8}$/.test(day)) {
        return new Response(JSON.stringify({ error: "Formato de fecha inválido" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Guardar registro verificado en Postgres
      await db.insert(scores).values({
        initials,
        day,
        strokes: strokeVal
      });

      return new Response(JSON.stringify({ success: true, message: "Puntuación registrada con éxito" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });

    } catch (err: any) {
      console.error("Error al registrar la puntuación:", err);
      return new Response(JSON.stringify({ error: "Error de servidor al guardar el récord" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  return new Response("Método no permitido", { status: 405 });
};
