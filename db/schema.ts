import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const scores = sqliteTable('scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  initials: text('initials').notNull(),
  day: text('day').notNull(),
  strokes: integer('strokes').notNull(),
  // SQLite usa UNIX timestamps (enteros)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});