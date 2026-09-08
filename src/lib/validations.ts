import { z } from "zod";

// ─── Players ─────────────────────────────────────────────────────────────────

export const createPlayerSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  nickname: z.string().max(30).nullable().optional(),
});

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessionPlayerInput = z.object({
  playerId: z.string().uuid(),
  finishPosition: z.number().int().min(1).max(9),
  buyIn: z.number().int().positive().nullable().optional(),
  cashOut: z.number().int().min(0).nullable().optional(),
  drinks: z.number().int().min(0).nullable().optional(),
});

export const createSessionSchema = z
  .object({
    playedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
      .optional(),
    players: z
      .array(sessionPlayerInput)
      .min(2, "Minimum 2 players required")
      .max(9, "Maximum 9 players allowed"),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine(
    (data) => {
      // Positions must be unique
      const positions = data.players.map((p) => p.finishPosition);
      return new Set(positions).size === positions.length;
    },
    { message: "Positions must be unique", path: ["players"] }
  )
  .refine(
    (data) => {
      // Positions must be consecutive starting from 1
      const positions = data.players
        .map((p) => p.finishPosition)
        .sort((a, b) => a - b);
      return positions.every((pos, i) => pos === i + 1);
    },
    { message: "Positions must be consecutive starting from 1", path: ["players"] }
  )
  .refine(
    (data) => {
      // Player IDs must be unique
      const ids = data.players.map((p) => p.playerId);
      return new Set(ids).size === ids.length;
    },
    { message: "Player IDs must be unique", path: ["players"] }
  );

// ─── Hands ───────────────────────────────────────────────────────────────────

export const handPlayerInput = z.object({
  playerId: z.string().uuid(),
  participated: z.boolean().default(true),
  wentAllIn: z.boolean().default(false),
  won: z.boolean().default(false),
  drinks: z.number().int().min(0).default(0),
});

export const handTypeValues = [
  "high_card", "pair", "two_pair", "three_of_a_kind", "straight",
  "flush", "full_house", "four_of_a_kind", "straight_flush", "royal_flush",
] as const;

export const createHandSchema = z
  .object({
    dealerId: z.string().uuid().nullable().optional(),
    sbId: z.string().uuid().nullable().optional(),
    winningHandType: z.enum(handTypeValues).nullable().optional(),
    players: z
      .array(handPlayerInput)
      .min(2, "Minimum 2 players in a hand"),
  })
  .refine(
    (data) => {
      return data.players.some((p) => p.participated);
    },
    { message: "At least one player must participate", path: ["players"] }
  )
  .refine(
    (data) => {
      const winners = data.players.filter((p) => p.participated && p.won);
      return winners.length === 1;
    },
    { message: "Exactly one participant must win the hand", path: ["players"] }
  );

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CreateHandInput = z.infer<typeof createHandSchema>;
