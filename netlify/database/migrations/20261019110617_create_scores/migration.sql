CREATE TABLE "scores" (
	"id" serial PRIMARY KEY,
	"initials" text NOT NULL,
	"day" text NOT NULL,
	"strokes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "scores_day_strokes_idx" ON "scores" ("day","strokes");