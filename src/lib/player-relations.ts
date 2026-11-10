import { db } from "@/db";
import {
  sessionPlayers,
  sessions,
  players,
  handPlayers,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Relations between players, computed in BATCH.
 *
 * The live view only needs three historical facts per player: who is their
 * kryptonite, who is their nemesis and their current win/loss streak. Loading
 * the full `PlayerProfile` for that is wasteful: `getPlayerProfile` runs ~13
 * queries per player, so a table of 8 players costs ~100 round trips.
 *
 * This module loads the underlying rows ONCE for the whole table and derives
 * the three facts in memory. Cost: 3 queries regardless of table size.
 *
 * The pure computation is shared with `lib/player-profile.ts` so the dashboard
 * profile and the live view can never disagree.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlayerRelation = {
  playerId: string;
  name: string;
  nickname: string | null;
  detail: string;
};

export type PlayerStreak = {
  type: "win" | "loss";
  count: number;
};

export type PlayerRelations = {
  kryptonite: PlayerRelation | null;
  nemesis: PlayerRelation | null;
  currentStreak: PlayerStreak;
};

/** A closed session of a player, with the position they finished in. */
export type ClosedSession = {
  sessionId: string;
  finishPosition: number;
  /** Date the session was played (YYYY-MM-DD), used to order the streak. */
  playedAt: string;
};

export type RelationInput = {
  playerId: string;
  /** Closed sessions of this player, any order (sorted internally). */
  closedSessions: ClosedSession[];
  /** sessionId -> set of playerIds that attended it. */
  sessionAttendees: Map<string, Set<string>>;
  /** Players to evaluate as a potential kryptonite. */
  candidateIds: string[];
  /** All known players, by id. */
  playersById: Map<string, { id: string; name: string; nickname: string | null }>;
  /** killerId -> number of times they eliminated this player. */
  killerCounts: Map<string, number>;
};

// ─── Pure computation ────────────────────────────────────────────────────────

/**
 * Consecutive session wins/losses, counted from the most recent session
 * backwards. Sessions are ordered oldest -> newest by play date so the walk
 * always starts at the latest night played.
 */
export function computeCurrentStreak(
  closedSessions: ClosedSession[]
): PlayerStreak {
  if (closedSessions.length === 0) return { type: "loss", count: 0 };

  const ordered = [...closedSessions].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  const positions = ordered.map((s) => s.finishPosition);

  const lastPos = positions[positions.length - 1];
  if (lastPos === 1) {
    let count = 0;
    for (let i = positions.length - 1; i >= 0; i--) {
      if (positions[i] === 1) count++;
      else break;
    }
    return { type: "win", count };
  }

  let count = 0;
  for (let i = positions.length - 1; i >= 0; i--) {
    if (positions[i] !== 1) count++;
    else break;
  }
  return { type: "loss", count };
}

/**
 * The player whose presence tanks this player's win rate: the one they shared
 * the most tables with, but win less often when they do.
 *
 * Requires at least 5 closed sessions, at least 3 shared with the candidate
 * and at least 2 without them.
 */
export function computeKryptonite(input: RelationInput): PlayerRelation | null {
  const {
    playerId,
    closedSessions,
    sessionAttendees,
    candidateIds,
    playersById,
  } = input;

  if (closedSessions.length < 5) return null;

  let biggestDrop = 0;
  let kryptonitePlayer: { id: string; name: string; nickname: string | null } | null = null;

  // Ties are broken by playerId so the result is stable across calls.
  for (const otherId of [...candidateIds].sort()) {
    if (otherId === playerId) continue;

    const withOther = closedSessions.filter((s) =>
      sessionAttendees.get(s.sessionId)?.has(otherId)
    );
    const withoutOther = closedSessions.filter(
      (s) => !sessionAttendees.get(s.sessionId)?.has(otherId)
    );

    if (withOther.length < 3 || withoutOther.length < 2) continue;

    const winRateWith = withOther.filter((s) => s.finishPosition === 1).length / withOther.length;
    const winRateWithout = withoutOther.filter((s) => s.finishPosition === 1).length / withoutOther.length;
    const drop = winRateWithout - winRateWith;

    if (drop > biggestDrop) {
      biggestDrop = drop;
      kryptonitePlayer = playersById.get(otherId) ?? null;
    }
  }

  if (!kryptonitePlayer || biggestDrop <= 0.1) return null;

  return {
    playerId: kryptonitePlayer.id,
    name: kryptonitePlayer.name,
    nickname: kryptonitePlayer.nickname,
    detail: `Tu win rate baja ${Math.round(biggestDrop * 100)}% cuando está`,
  };
}

/** The player who eliminated this player the most often. */
export function computeNemesis(input: RelationInput): PlayerRelation | null {
  const { playerId, killerCounts, playersById } = input;
  if (killerCounts.size === 0) return null;

  const [topKillerId, count] = [...killerCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0];
  const killer = playersById.get(topKillerId);
  if (!killer) return null;

  return {
    playerId: topKillerId,
    name: killer.name,
    nickname: killer.nickname,
    detail: `Te eliminó ${count} veces`,
  };
}

/** All three facts for one player. */
export function computeRelations(input: RelationInput): PlayerRelations {
  return {
    kryptonite: computeKryptonite(input),
    nemesis: computeNemesis(input),
    currentStreak: computeCurrentStreak(input.closedSessions),
  };
}

// ─── Batch loader ────────────────────────────────────────────────────────────

type SessionRow = {
  sessionId: string;
  playerId: string;
  finishPosition: number | null;
  playedAt: string;
};

type SummaryRow = {
  playerId: string;
  sessionsPlayed: number;
  podiums: number;
  handsPlayed: number;
  handsWon: number;
  kills: number;
};

type KillerRow = {
  victimId: string;
  killerId: string;
  n: number;
};

/** Career summary of a player, computed in batch. */
export type PlayerSummary = {
  playerId: string;
  sessionsPlayed: number;
  podiums: number;
  handsPlayed: number;
  handsWon: number;
  handWinRate: number;
  kills: number;
};

export type LoadedRelationData = {
  sessionRows: SessionRow[];
  killerRows: KillerRow[];
  summaryRows: SummaryRow[];
  playersById: Map<string, { id: string; name: string; nickname: string | null }>;
};

/**
 * Load every row the relation computation needs, in 4 queries.
 *
 * - sessionRows: one row per session_player (attendees + closed positions)
 * - killerRows: elimination counts, aggregated per (victim, killer)
 * - summaryRows: career summary per player (sessions, podiums, hands, kills)
 * - playersById: the players directory
 */
export async function loadRelationData(): Promise<LoadedRelationData> {
  const [sessionRows, killerRows, summaryRows, playerRows] = await Promise.all([
    db
      .select({
        sessionId: sessionPlayers.sessionId,
        playerId: sessionPlayers.playerId,
        finishPosition: sessionPlayers.finishPosition,
        playedAt: sessions.playedAt,
      })
      .from(sessionPlayers)
      .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id)),

    // Elimination counts: for every victim, who took them out and how often.
    // `distinct on (hand_id)` keeps one winner per hand, so a split pot is
    // not counted twice.
    db.execute(sql`
      select e.player_id as "victimId", w.player_id as "killerId", count(*)::int as "n"
      from hand_players e
      join (
        select distinct on (hand_id) hand_id, player_id
        from hand_players
        where won = true
        order by hand_id, player_id
      ) w on w.hand_id = e.hand_id
      where e.eliminated = true
      group by e.player_id, w.player_id
    `),

    // Career summary for every player in a single pass.
    db.execute(sql`
      select
        sp.player_id as "playerId",
        count(sp.session_id) filter (where sp.finish_position is not null)::int as "sessionsPlayed",
        count(sp.session_id) filter (where sp.finish_position <= 3 and sp.finish_position is not null)::int as "podiums",
        coalesce(h.hands_played, 0)::int as "handsPlayed",
        coalesce(h.hands_won, 0)::int as "handsWon",
        coalesce(h.kills, 0)::int as "kills"
      from session_players sp
      left join (
        select
          hp.player_id,
          count(*) filter (where hp.participated)::int as hands_played,
          count(*) filter (where hp.won)::int as hands_won,
          coalesce((
            select count(*)::int
            from hand_players e
            join (
              select distinct on (hand_id) hand_id, player_id
              from hand_players
              where won = true
              order by hand_id, player_id
            ) w on w.hand_id = e.hand_id
            where e.eliminated = true and w.player_id = hp.player_id
          ), 0) as kills
        from hand_players hp
        group by hp.player_id
      ) h on h.player_id = sp.player_id
      group by sp.player_id, h.hands_played, h.hands_won, h.kills
    `),

    db
      .select({ id: players.id, name: players.name, nickname: players.nickname })
      .from(players),
  ]);

  return {
    sessionRows,
    killerRows: (killerRows.rows ?? []) as unknown as KillerRow[],
    summaryRows: (summaryRows.rows ?? []) as unknown as SummaryRow[],
    playersById: new Map(playerRows.map((p) => [p.id, p])),
  };
}

/**
 * Career summaries for a set of players, computed from a single batch load.
 */
export async function getPlayerSummaries(
  playerIds: string[],
  data?: LoadedRelationData
): Promise<Map<string, PlayerSummary>> {
  const loaded = data ?? (await loadRelationData());
  const result = new Map<string, PlayerSummary>();

  for (const row of loaded.summaryRows) {
    if (!playerIds.includes(row.playerId)) continue;
    result.set(row.playerId, {
      playerId: row.playerId,
      sessionsPlayed: row.sessionsPlayed,
      podiums: row.podiums,
      handsPlayed: row.handsPlayed,
      handsWon: row.handsWon,
      handWinRate:
        row.handsPlayed > 0
          ? Math.round((row.handsWon / row.handsPlayed) * 100)
          : 0,
      kills: row.kills,
    });
  }

  return result;
}

/**
 * Relations for a set of players, computed from a single batch load.
 *
 * @param playerIds players to compute relations for
 * @param data optional pre-loaded data (load once, reuse for many players)
 */
export async function getPlayerRelations(
  playerIds: string[],
  data?: LoadedRelationData
): Promise<Map<string, PlayerRelations>> {
  const loaded = data ?? (await loadRelationData());

  // sessionId -> attendees
  const sessionAttendees = new Map<string, Set<string>>();
  for (const row of loaded.sessionRows) {
    const set = sessionAttendees.get(row.sessionId) || new Set<string>();
    set.add(row.playerId);
    sessionAttendees.set(row.sessionId, set);
  }

  // playerId -> closed sessions
  const closedByPlayer = new Map<string, ClosedSession[]>();
  for (const row of loaded.sessionRows) {
    if (row.finishPosition === null) continue;
    const list = closedByPlayer.get(row.playerId) || [];
    list.push({
      sessionId: row.sessionId,
      finishPosition: row.finishPosition,
      playedAt: row.playedAt,
    });
    closedByPlayer.set(row.playerId, list);
  }

  // victimId -> killerId -> count
  const killersByVictim = new Map<string, Map<string, number>>();
  for (const row of loaded.killerRows) {
    const map = killersByVictim.get(row.victimId) || new Map<string, number>();
    map.set(row.killerId, row.n);
    killersByVictim.set(row.victimId, map);
  }

  const result = new Map<string, PlayerRelations>();
  for (const playerId of playerIds) {
    const closedSessions = closedByPlayer.get(playerId) || [];

    // Only players who shared a table with this one can be a kryptonite.
    const candidateIds = new Set<string>();
    for (const s of closedSessions) {
      for (const other of sessionAttendees.get(s.sessionId) ?? []) {
        if (other !== playerId) candidateIds.add(other);
      }
    }

    result.set(
      playerId,
      computeRelations({
        playerId,
        closedSessions,
        sessionAttendees,
        candidateIds: [...candidateIds],
        playersById: loaded.playersById,
        killerCounts: killersByVictim.get(playerId) ?? new Map<string, number>(),
      })
    );
  }

  return result;
}
