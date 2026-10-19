import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const scores = pgTable(
  "scores",
  {
    id: serial().primaryKey(),
    initials: text().notNull(),
    day: text().notNull(), // YYYYMMDD of the daily course
    strokes: integer().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("scores_day_strokes_idx").on(t.day, t.strokes)],
);
