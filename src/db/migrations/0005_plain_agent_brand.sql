CREATE INDEX "hand_players_player_id_idx" ON "hand_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "hands_session_id_idx" ON "hands" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "hands_dealer_id_idx" ON "hands" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "hands_sb_id_idx" ON "hands" USING btree ("sb_id");--> statement-breakpoint
CREATE INDEX "session_insights_hand_id_idx" ON "session_insights" USING btree ("hand_id");--> statement-breakpoint
CREATE INDEX "session_insights_session_id_idx" ON "session_insights" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_players_player_id_idx" ON "session_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "sessions_is_live_idx" ON "sessions" USING btree ("is_live");--> statement-breakpoint
CREATE INDEX "substitutions_revived_player_id_idx" ON "substitutions" USING btree ("revived_player_id");