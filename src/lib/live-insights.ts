/**
 * Table-level ("rolling") insights for the live view.
 *
 * Unlike `lib/insights.ts` (which generates 3-5 insights per recorded hand and
 * persists them), these are computed on every `/api/poker/live` poll from the
 * aggregates the endpoint already has. They keep the NewsTicker alive when the
 * last hand produced nothing interesting.
 *
 * They are NOT persisted: they have stable ids derived from their dedup key so
 * the client can deduplicate and the ticker doesn't flicker.
 */

// Type-only import: keeps this module free of DB/runtime dependencies.
import type { PlayerRelations } from "@/lib/player-relations";

export type TableInsight = {
  id: string;
  emoji: string;
  message: string;
  type: "streak" | "rivalry" | "allIn" | "prediction" | "historical" | "milestone";
  scope: "table";
  // Coarse theme used to avoid repeating a theme already covered by the last
  // hand's insights (e.g. fold streak vs ghost).
  theme: string;
};

/**
 * Map a persisted hand insight to a coarse theme so the merge can drop table
 * insights that would repeat it. Uses `dedupKey` when present and falls back to
 * the emoji for rows generated before `dedupKey` existed.
 */
export function themeOfHandInsight(insight: {
  dedupKey: string | null;
  emoji: string;
}): string | null {
  if (insight.dedupKey) {
    const prefix = insight.dedupKey.split(":")[0];
    if (prefix === "fold_streak") return "fold";
    if (prefix === "allin_survival" || prefix === "allin_hand") return "allin";
    if (prefix === "leader_takeover" || prefix === "gap_close") return "leader";
    return prefix;
  }

  // Legacy rows (before dedupKey) — best-effort emoji mapping.
  if (insight.emoji === "🪑") return "fold";
  if (["🐊", "😰", "🛡️", "⚠️"].includes(insight.emoji)) return "allin";
  if (insight.emoji === "👑") return "leader";
  if (insight.emoji === "🧿") return "rivalry";
  return null;
}

// Table insights are capped by the merge (hand insights first). Sorting them by
// theme priority keeps the most dramatic ones from being cut.
const TABLE_THEME_PRIORITY: Record<string, number> = {
  headsup: 10,
  killer: 9,
  rivalry: 9,
  milestone: 8,
  hot_streak: 7,
  leader: 7,
  allin: 5,
  fold: 4,
};

type RankingEntry = {
  playerId: string;
  name: string;
  nickname: string | null;
  handsWon: number;
  handsPlayed: number;
  handsFolded: number;
  allIns: number;
  isEliminated: boolean;
  seatOrder: number | null;
};

type ScoreboardData = {
  playersAlive: number;
  playersOut: number;
  totalPlayers: number;
  totalAllIns: number;
  totalEliminations: number;
  leader: { playerId: string; name: string; handsWon: number } | null;
  topKiller: { playerId: string; name: string; kills: number } | null;
};

export function buildTableInsights(input: {
  ranking: RankingEntry[];
  scoreboard: ScoreboardData;
  handCount: number;
  aliveCount: number;
  // Historical relations of the alive players (optional). Callers should load
  // these in batch — the full PlayerProfile is expensive and this runs on every
  // live poll. Only three facts are actually needed: kryptonite, nemesis and
  // the current streak.
  relations?: Map<string, PlayerRelations>;
}): TableInsight[] {
  const { ranking, scoreboard, aliveCount, relations, handCount } = input;

  const insights: TableInsight[] = [];
  const nameOf = (p: { name: string; nickname: string | null }) =>
    p.nickname || p.name;

  const alive = ranking.filter((p) => !p.isEliminated);
  const sorted = [...alive].sort((a, b) => b.handsWon - a.handsWon);

  // 🔮 Heads-up warning: one more elimination and it's 1v1.
  if (aliveCount === 3) {
    insights.push({
      id: "table:headsup_warning",
      emoji: "🔮",
      message: "Si cae uno más, quedan 2 — se acerca el heads-up",
      type: "prediction",
      scope: "table",
      theme: "headsup",
    });
  }

  // ⚔️ Heads-up reached.
  if (aliveCount === 2 && alive.length === 2) {
    insights.push({
      id: "table:headsup",
      emoji: "⚔️",
      message: `Heads-up: ${nameOf(alive[0])} vs ${nameOf(alive[1])}`,
      type: "prediction",
      scope: "table",
      theme: "headsup",
    });
  }

  // 📉 Tie at the top (nobody is pulling away).
  if (
    sorted.length >= 2 &&
    sorted[0].handsWon > 0 &&
    sorted[0].handsWon === sorted[1].handsWon
  ) {
    insights.push({
      id: "table:top_tie",
      emoji: "📉",
      message: `${nameOf(sorted[0])} y ${nameOf(sorted[1])} empatados arriba — nadie suelta el liderato`,
      type: "prediction",
      scope: "table",
      theme: "leader",
    });
  }

  // 👻 Ghost: alive but has been folding a lot.
  const ghost = [...alive]
    .filter((p) => p.handsFolded >= 5)
    .sort((a, b) => b.handsFolded - a.handsFolded)[0];
  if (ghost) {
    insights.push({
      id: `table:ghost:${ghost.playerId}`,
      emoji: "👻",
      message: `${nameOf(ghost)} lleva ${ghost.handsFolded} manos sin entrar — el fantasma de la mesa`,
      type: "streak",
      scope: "table",
      theme: "fold",
    });
  }

  // 💀 Executioner: the top killer is stacking bodies.
  if (scoreboard.topKiller && scoreboard.topKiller.kills >= 3) {
    insights.push({
      id: `table:killer:${scoreboard.topKiller.playerId}`,
      emoji: "💀",
      message: `${scoreboard.topKiller.name} suma ${scoreboard.topKiller.kills} eliminaciones esta noche`,
      type: "milestone",
      scope: "table",
      theme: "killer",
    });
  }

  // 🎰 Dominance: the leader is running away with it.
  if (sorted.length >= 2) {
    const top = sorted[0];
    const last = sorted[sorted.length - 1];
    const gap = top.handsWon - last.handsWon;
    if (top.handsWon >= 3 && gap >= 5) {
      insights.push({
        id: "table:dominance",
        emoji: "🎰",
        message: `${nameOf(top)} le saca ${gap} botes al último — dominio total`,
        type: "historical",
        scope: "table",
        theme: "leader",
      });
    }
  }

  // 💥 All-in festival.
  if (handCount >= 5 && scoreboard.totalAllIns >= 8) {
    insights.push({
      id: "table:allin_fest",
      emoji: "💥",
      message: `Noche de all-ins: ${scoreboard.totalAllIns} ya`,
      type: "allIn",
      scope: "table",
      theme: "allin",
    });
  }

  // ─── Historical hints (from cached player profiles) ───────────────────────

  if (relations && relations.size > 0) {
    const aliveIds = new Set(alive.map((p) => p.playerId));

    // 🧪 Kryptonite present: an alive player's nemesis is also alive.
    for (const player of alive) {
      const kryptonite = relations.get(player.playerId)?.kryptonite;
      if (kryptonite && aliveIds.has(kryptonite.playerId)) {
        insights.push({
          id: `table:kryptonite:${player.playerId}`,
          emoji: "🧪",
          message: `${nameOf(player)} tiene a su kryptonita en la mesa: ${kryptonite.nickname || kryptonite.name}`,
          type: "rivalry",
          scope: "table",
          theme: "rivalry",
        });
        break; // one is enough
      }
    }

    // ☠️ Nemesis present (only if kryptonite didn't already cover rivalry).
    if (!insights.some((insight) => insight.theme === "rivalry")) {
      for (const player of alive) {
        const nemesis = relations.get(player.playerId)?.nemesis;
        if (nemesis && aliveIds.has(nemesis.playerId)) {
          insights.push({
            id: `table:nemesis:${player.playerId}`,
            emoji: "☠️",
            message: `${nameOf(player)} tiene a su nemesis en la mesa: ${nemesis.nickname || nemesis.name}`,
            type: "rivalry",
            scope: "table",
            theme: "rivalry",
          });
          break;
        }
      }
    }

    // 🔥 Historical streak: coming off consecutive session wins.
    const onFire = [...alive]
      .map((player) => ({ player, relations: relations.get(player.playerId) }))
      .filter(
        ({ relations }) =>
          relations?.currentStreak.type === "win" &&
          relations.currentStreak.count >= 2
      )
      .sort(
        (a, b) =>
          (b.relations?.currentStreak.count ?? 0) -
          (a.relations?.currentStreak.count ?? 0)
      )[0];
    if (onFire?.relations) {
      insights.push({
        id: `table:hist_streak:${onFire.player.playerId}`,
        emoji: "🔥",
        message: `${nameOf(onFire.player)} viene de ganar ${onFire.relations.currentStreak.count} noches seguidas`,
        type: "streak",
        scope: "table",
        theme: "hot_streak",
      });
    }
  }

  // 🏅 Historic night: 8+ pots in a single session. Session-only rule, so it
  // does not depend on historical profiles.
  const bigNight = [...alive]
    .filter((p) => p.handsWon >= 8)
    .sort((a, b) => b.handsWon - a.handsWon)[0];
  if (bigNight) {
    insights.push({
      id: `table:big_night:${bigNight.playerId}`,
      emoji: "🏅",
      message: `${nameOf(bigNight)} con ${bigNight.handsWon} botes — noche histórica`,
      type: "milestone",
      scope: "table",
      theme: "milestone",
    });
  }

  const priorityOf = (theme: string) => TABLE_THEME_PRIORITY[theme] ?? 0;
  return insights.sort((a, b) => priorityOf(b.theme) - priorityOf(a.theme));
}
