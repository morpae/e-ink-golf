import { drizzle } from 'drizzle-orm/d1';
import { scores } from '../../db/schema';
import { eq } from 'drizzle-orm';

// Aquí definimos que Cloudflare inyectará la base de datos bajo el nombre "DB"
export interface Env {
  DB: D1Database;
}

// MANEJAR PETICIONES GET (Leer Leaderboard)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const day = url.searchParams.get('day');

  if (!day) {
    return new Response(JSON.stringify({ error: 'Falta el parámetro day' }), { status: 400 });
  }

  // Inicializar Drizzle con la DB inyectada por Cloudflare
  const db = drizzle(context.env.DB);
  
  try {
    const result = await db.select()
                           .from(scores)
                           .where(eq(scores.day, day))
                           .orderBy(scores.strokes)
                           .limit(10);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error de BD' }), { status: 500 });
  }
};

// MANEJAR PETICIONES POST (Guardar Puntuación)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const data = await context.request.json() as { initials: string; day: string; strokes: number };
    
    if (!data.initials || !data.day || !data.strokes) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 });
    }

    const db = drizzle(context.env.DB);
    
    await db.insert(scores).values({
      initials: data.initials,
      day: data.day,
      strokes: data.strokes,
      createdAt: new Date()
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500 });
  }
};