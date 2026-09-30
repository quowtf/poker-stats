CREATE TYPE "public"."heads_up_mode" AS ENUM('natura', 'best_of_5', 'best_of_3');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "heads_up_mode" "heads_up_mode" DEFAULT 'natura' NOT NULL;