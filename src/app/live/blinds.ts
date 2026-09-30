/**
 * Blind structure (house convention).
 *
 * Blinds go UP every HANDS_PER_LEVEL hands (not on a clock). The starting
 * blinds are SB 5 / BB 10, and each level roughly scales the previous one
 * (≈1.5–2×) but rounded to chip-friendly numbers so players can actually make
 * change with physical chips. These amounts aren't stored in the DB; only the
 * current round drives the level.
 */
export const HANDS_PER_LEVEL = 3;

export type BlindLevel = { sb: number; bb: number };

export const BLIND_LEVELS: BlindLevel[] = [
  { sb: 5, bb: 10 },
  { sb: 10, bb: 20 },
  { sb: 15, bb: 30 },
  { sb: 25, bb: 50 },
  { sb: 50, bb: 100 },
  { sb: 75, bb: 150 },
  { sb: 100, bb: 200 },
  { sb: 150, bb: 300 },
  { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 },
  { sb: 1000, bb: 1500 },
];

/** Level index (0-based) for a given round/hand number. */
export function blindLevelIndex(round: number): number {
  return Math.min(BLIND_LEVELS.length - 1, Math.floor(round / HANDS_PER_LEVEL));
}

/** How many hands until the blinds go up (0 if already at max level). */
export function handsToNextLevel(round: number): number {
  const idx = blindLevelIndex(round);
  if (idx >= BLIND_LEVELS.length - 1) return 0;
  return (idx + 1) * HANDS_PER_LEVEL - round;
}

// ─── Heads-up (1v1 final) modes ──────────────────────────────────────────────
// Chosen once at session setup. PURELY INFORMATIVE: it only changes which
// blinds the scoreboard shows once the table is down to 2 players. The winner
// is still decided by the recorder marking an all-in/elimination, exactly like
// the rest of the game.
export type HeadsUpMode = "natura" | "best_of_5" | "best_of_3";

export const HEADS_UP_MODES: {
  id: HeadsUpMode;
  title: string;
  emoji: string;
  description: string;
}[] = [
  {
    id: "natura",
    title: "Natura",
    emoji: "🎲",
    description: "Ruleta rusa: las ciegas siguen subiendo cada 3 manos.",
  },
  {
    id: "best_of_5",
    title: "Mejor de 5",
    emoji: "🖐️",
    description: "Ciegas bajan a 5/10. Gana el primero en llegar a 5 manos.",
  },
  {
    id: "best_of_3",
    title: "50/50",
    emoji: "⚖️",
    description: "Ciegas a 100/200. Gana el mejor de 3 manos.",
  },
];

/** Fixed blinds during heads-up for the fixed-blind modes (null = keep curve). */
const HEADS_UP_BLINDS: Record<HeadsUpMode, BlindLevel | null> = {
  natura: null, // keep the normal escalating curve
  best_of_5: { sb: 5, bb: 10 },
  best_of_3: { sb: 100, bb: 200 },
};

/**
 * Blinds to display for a given round + heads-up context. When the table is
 * down to 2 players and the mode fixes the blinds, returns those; otherwise
 * falls back to the normal escalating level for the round.
 */
export function blindsForRound(
  round: number,
  opts?: { isHeadsUp?: boolean; mode?: HeadsUpMode | null }
): BlindLevel {
  if (opts?.isHeadsUp && opts.mode) {
    const fixed = HEADS_UP_BLINDS[opts.mode];
    if (fixed) return fixed;
  }
  return BLIND_LEVELS[blindLevelIndex(round)];
}
