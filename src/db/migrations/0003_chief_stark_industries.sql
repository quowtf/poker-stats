CREATE TYPE "public"."insight_scope" AS ENUM('hand', 'table');--> statement-breakpoint
ALTER TABLE "session_insights" ADD COLUMN "scope" "insight_scope" DEFAULT 'hand' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_insights" ADD COLUMN "dedup_key" varchar(120);