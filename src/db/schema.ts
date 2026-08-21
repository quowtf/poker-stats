import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("user_role", ["admin", "viewer"]);

// ─── Auth ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Domain ──────────────────────────────────────────────────────────────────

export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  nickname: varchar("nickname", { length: 30 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  playedAt: date("played_at", { mode: "string" }).notNull(),
  playerCount: integer("player_count").notNull(),
  notes: text("notes"),
  isLive: boolean("is_live").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessionPlayers = pgTable(
  "session_players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    finishPosition: integer("finish_position"), // nullable: auto-calculated when session closes
    buyIn: integer("buy_in"),
    cashOut: integer("cash_out"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("session_player_unique").on(table.sessionId, table.playerId),
  ]
);

// ─── Hands (per-round tracking within a session) ─────────────────────────────

export const hands = pgTable("hands", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  handNumber: integer("hand_number").notNull(),
  dealerId: uuid("dealer_id").references(() => players.id, { onDelete: "restrict" }),
  sbId: uuid("sb_id").references(() => players.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const handPlayers = pgTable(
  "hand_players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    handId: uuid("hand_id")
      .notNull()
      .references(() => hands.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    participated: boolean("participated").notNull().default(true), // entered the hand
    wentAllIn: boolean("went_all_in").notNull().default(false),
    won: boolean("won").notNull().default(false), // won the pot
    eliminated: boolean("eliminated").notNull().default(false), // lost all chips this hand
    drinks: integer("drinks").notNull().default(0), // drinks consumed this hand
  },
  (table) => [
    uniqueIndex("hand_player_unique").on(table.handId, table.playerId),
  ]
);

// ─── Substitutions (player leaves, gives chips to eliminated player) ─────────

export const substitutions = pgTable("substitutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  handNumber: integer("hand_number").notNull(), // at which hand this happened
  leftPlayerId: uuid("left_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "restrict" }),
  revivedPlayerId: uuid("revived_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Insights (generated per hand, persisted for history) ────────────────────

export const insightTypeEnum = pgEnum("insight_type", [
  "streak",
  "rivalry",
  "allIn",
  "prediction",
  "historical",
  "elimination",
  "milestone",
]);

export const sessionInsights = pgTable("session_insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  handId: uuid("hand_id").references(() => hands.id, { onDelete: "cascade" }),
  emoji: varchar("emoji", { length: 10 }).notNull(),
  message: text("message").notNull(),
  type: insightTypeEnum("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionPlayer = typeof sessionPlayers.$inferSelect;
export type NewSessionPlayer = typeof sessionPlayers.$inferInsert;
export type Hand = typeof hands.$inferSelect;
export type NewHand = typeof hands.$inferInsert;
export type HandPlayer = typeof handPlayers.$inferSelect;
export type NewHandPlayer = typeof handPlayers.$inferInsert;
export type SessionInsight = typeof sessionInsights.$inferSelect;
export type NewSessionInsight = typeof sessionInsights.$inferInsert;
export type Substitution = typeof substitutions.$inferSelect;
export type NewSubstitution = typeof substitutions.$inferInsert;
