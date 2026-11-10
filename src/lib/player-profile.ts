import { db } from "@/db";
import {
  sessions,
  sessionPlayers,
  players,
  hands,
  handPlayers,
  substitutions,
  HAND_TYPE_LABELS,
} from "@/db/schema";
import { eq, and, inArray, count } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  computeRelations,
  type ClosedSession,
} from "@/lib/player-relations";

// ─── Types ───────────────────────────────────────────────────────────────────

// Number of most recent closed sessions used to classify a player's archetype.
// Change this single constant to widen or narrow the window.
export const ARCHETYPE_WINDOW_SESSIONS = 5;

// Minimum sample before an archetype is assigned. Below this the player is a
// Polluelo ("muestra chica") instead of a misleading label.
export const ARCHETYPE_MIN_HANDS = 60;
export const ARCHETYPE_MIN_SESSIONS = 3;

export type ArchetypeId =
  | "tiburon"
  | "tortuga"
  | "jabali"
  | "dodo"
  | "rinoceronte"
  | "cocodrilo"
  | "serpiente"
  | "canguro"
  | "zorro"
  | "camaleon"
  | "polluelo";

export type PlayerStyle = {
  id: ArchetypeId;
  name: string;
  emoji: string;
  description: string;
  // Human-readable explanation for the profile tooltip. Computed from the
  // same window that produced the archetype.
  evidence: string;
};

export type PlayerRelation = {
  playerId: string;
  name: string;
  nickname: string | null;
  detail: string;
};

export type PlayerProfile = {
  id: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;

  // Identity
  style: PlayerStyle;
  dangerLevel: number; // 1-5

  // Metrics used to classify the archetype (last ARCHETYPE_WINDOW_SESSIONS
  // closed sessions). Career stats below are still lifetime numbers.
  window: {
    sessions: number;
    handsSeen: number;
    allInRate: number;
    conversion: number;
    survival: number;
    killRate: number;
    headsUpRate: number;
    winRate: number;
    posPercentile: number;
    volatility: number;
    allIns: number;
  };

  // Relations
  favoriteVictim: PlayerRelation | null;
  nemesis: PlayerRelation | null;
  kryptonite: PlayerRelation | null; // player whose presence tanks their win rate

  // Session stats
  sessionsPlayed: number;
  wins: number;
  podiums: number;
  avgPosition: number;
  bestPosition: number;
  worstPosition: number;

  // Hand stats
  handsPlayed: number;
  handsWon: number;
  handWinRate: number;
  foldRate: number;
  allIns: number;
  allInsWon: number;
  allInSurvivalRate: number;
  kills: number;

  // Position role stats (D/SB)
  dealerWinRate: number;
  dealerHands: number;
  sbWinRate: number;
  sbHands: number;

  // Fun stats
  clutchFactor: number; // win rate in heads-up (2 players alive)
  bestComeback: { allIns: number; position: number } | null; // session with most all-ins survived + good finish
  drinkStats: { total: number; perSession: number; winRateSober: number; winRateDrunk: number };
  currentStreak: { type: "win" | "loss"; count: number };

  // Signature winning hand
  signatureHand: { label: string; emoji: string; count: number } | null;

  // Badges
  badges: { emoji: string; title: string; detail: string }[];

  // Revivals
  timesRevived: number;
  revivedBy: PlayerRelation | null;
};

// ─── Main function ───────────────────────────────────────────────────────────

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  // Get player info
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player) return null;

  // ─── Session data ────────────────────────────────────────────────────────

  const sessionData = await db
    .select({
      sessionId: sessionPlayers.sessionId,
      finishPosition: sessionPlayers.finishPosition,
      playerCount: sessions.playerCount,
      playedAt: sessions.playedAt,
    })
    .from(sessionPlayers)
    .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
    .where(eq(sessionPlayers.playerId, playerId));

  const closedSessions = sessionData.filter((s) => s.finishPosition !== null);
  const sessionsPlayed = closedSessions.length;
  const positions = closedSessions.map((s) => s.finishPosition!);
  const wins = positions.filter((p) => p === 1).length;
  const podiums = positions.filter((p) => p <= 3).length;
  const avgPosition = positions.length > 0 ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10 : 0;
  const bestPosition = positions.length > 0 ? Math.min(...positions) : 0;
  const worstPosition = positions.length > 0 ? Math.max(...positions) : 0;

  // ─── Archetype window (last N closed sessions) ──────────────────────────

  const orderedClosedSessions = [...closedSessions].sort((a, b) =>
    b.playedAt.localeCompare(a.playedAt)
  );
  const windowSessionIds = new Set(
    orderedClosedSessions
      .slice(0, ARCHETYPE_WINDOW_SESSIONS)
      .map((s) => s.sessionId)
  );
  const windowSessions = closedSessions.filter((s) =>
    windowSessionIds.has(s.sessionId)
  );

  // ─── Hand data (only this player's rows) ─────────────────────────────────
  //
  // The player has one row per hand they were dealt into (participated or
  // not), so this is their full history — filtered in SQL through
  // hand_players_player_id_idx instead of scanning the whole table.
  const myHands = await db
    .select({
      handId: handPlayers.handId,
      sessionId: hands.sessionId,
      participated: handPlayers.participated,
      won: handPlayers.won,
      wentAllIn: handPlayers.wentAllIn,
      eliminated: handPlayers.eliminated,
      drinks: handPlayers.drinks,
      winningHandType: hands.winningHandType,
    })
    .from(handPlayers)
    .innerJoin(hands, eq(handPlayers.handId, hands.id))
    .where(eq(handPlayers.playerId, playerId));

  const windowHands = myHands.filter((h) => windowSessionIds.has(h.sessionId));
  const handsPlayed = myHands.filter((h) => h.participated).length;
  const handsWon = myHands.filter((h) => h.won).length;
  const handWinRate = handsPlayed > 0 ? Math.round((handsWon / handsPlayed) * 100) : 0;
  const totalHandRecords = myHands.length;
  const foldedHands = myHands.filter((h) => !h.participated).length;
  const foldRate = totalHandRecords > 0 ? Math.round((foldedHands / totalHandRecords) * 100) : 0;
  const allIns = myHands.filter((h) => h.wentAllIn).length;
  const allInsWon = myHands.filter((h) => h.wentAllIn && h.won).length;
  const allInsSurvived = myHands.filter((h) => h.wentAllIn && !h.eliminated).length;
  const allInSurvivalRate = allIns > 0 ? Math.round((allInsSurvived / allIns) * 100) : 0;

  // ─── Kills (winner of hand where someone was eliminated) ────────────────
  //
  // Aggregated in SQL: for every hand this player won, count the players
  // eliminated in that hand. The self-join on hand_id uses
  // hand_players_hand_id_idx instead of loading every hand_players row.
  const mine = alias(handPlayers, "mine");
  const opponent = alias(handPlayers, "opponent");

  const victimRows = await db
    .select({
      victimId: opponent.playerId,
      sessionId: hands.sessionId,
      victims: count(),
    })
    .from(mine)
    .innerJoin(hands, eq(hands.id, mine.handId))
    .innerJoin(
      opponent,
      and(eq(opponent.handId, mine.handId), eq(opponent.eliminated, true))
    )
    .where(and(eq(mine.playerId, playerId), eq(mine.won, true)))
    .groupBy(opponent.playerId, hands.sessionId);

  let kills = 0;
  let windowKills = 0;
  const killVictims = new Map<string, number>(); // victimId -> count
  for (const row of victimRows) {
    kills += row.victims;
    if (windowSessionIds.has(row.sessionId)) windowKills += row.victims;
    killVictims.set(
      row.victimId,
      (killVictims.get(row.victimId) || 0) + row.victims
    );
  }

  // ─── Nemesis (who knocked this player out) ──────────────────────────────
  //
  // For every hand this player was eliminated in, the hand winner is the
  // player who took them down.
  const outPlayer = alias(handPlayers, "out_player");
  const handWinner = alias(handPlayers, "hand_winner");

  const killerRows = await db
    .select({ killerId: handWinner.playerId, kills: count() })
    .from(outPlayer)
    .innerJoin(
      handWinner,
      and(eq(handWinner.handId, outPlayer.handId), eq(handWinner.won, true))
    )
    .where(and(eq(outPlayer.playerId, playerId), eq(outPlayer.eliminated, true)))
    .groupBy(handWinner.playerId);

  const killedBy = new Map<string, number>(); // killerId -> count
  for (const row of killerRows) {
    killedBy.set(row.killerId, (killedBy.get(row.killerId) || 0) + row.kills);
  }

  // ─── Favorite victim ────────────────────────────────────────────────────

  let favoriteVictim: PlayerRelation | null = null;
  if (killVictims.size > 0) {
    // Ties are broken by playerId so the result is stable across calls
    // (the DB does not guarantee any particular row order).
    const [topVictimId, count] = [...killVictims.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0];
    const [victimPlayer] = await db.select().from(players).where(eq(players.id, topVictimId));
    if (victimPlayer) {
      favoriteVictim = {
        playerId: topVictimId,
        name: victimPlayer.name,
        nickname: victimPlayer.nickname,
        detail: `Eliminado ${count} veces`,
      };
    }
  }

  // ─── Nemesis ────────────────────────────────────────────────────────────
  //
  // Shared with the live view (lib/player-relations.ts) so both always agree.

  const relationPlayersById = new Map<string, { id: string; name: string; nickname: string | null }>();
  const candidateIds = new Set<string>();
  for (const [killerId] of killedBy) candidateIds.add(killerId);
  for (const [victimId] of killVictims) candidateIds.add(victimId);

  // Attendees of the sessions this player took part in. Only those sessions
  // matter for the kryptonite computation.
  const playerSessionIds = sessionData.map((s) => s.sessionId);
  const attendeeRows = await db
    .select({
      sessionId: sessionPlayers.sessionId,
      playerId: sessionPlayers.playerId,
    })
    .from(sessionPlayers)
    .where(inArray(sessionPlayers.sessionId, playerSessionIds));

  const sessionAttendees = new Map<string, Set<string>>();
  for (const sp of attendeeRows) {
    const set = sessionAttendees.get(sp.sessionId) || new Set<string>();
    set.add(sp.playerId);
    sessionAttendees.set(sp.sessionId, set);
  }

  // Only players who shared a table with this one can be a kryptonite.
  for (const set of sessionAttendees.values()) {
    for (const pid of set) {
      if (pid !== playerId) candidateIds.add(pid);
    }
  }

  if (candidateIds.size > 0) {
    const candidatePlayers = await db
      .select({ id: players.id, name: players.name, nickname: players.nickname })
      .from(players)
      .where(inArray(players.id, [...candidateIds]));
    for (const p of candidatePlayers) relationPlayersById.set(p.id, p);
  }

  const closedSessionList: ClosedSession[] = closedSessions.map((s) => ({
    sessionId: s.sessionId,
    finishPosition: s.finishPosition!,
    playedAt: s.playedAt,
  }));

  const sharedRelations = computeRelations({
    playerId,
    closedSessions: closedSessionList,
    sessionAttendees,
    candidateIds: [...candidateIds],
    playersById: relationPlayersById,
    killerCounts: killedBy,
  });

  const nemesis: PlayerRelation | null = sharedRelations.nemesis;

  // ─── Kryptonite (presence tanks win rate) ───────────────────────────────

  const kryptonite: PlayerRelation | null = sharedRelations.kryptonite;

  // ─── Dealer / SB stats ──────────────────────────────────────────────────
  //
  // Only the hands where this player held the button are needed, so the query
  // filters by role (indexed) instead of loading the whole hands table and
  // doing an O(n²) lookup.
  const dealerRows = await db
    .select({ id: hands.id })
    .from(hands)
    .where(eq(hands.dealerId, playerId));

  const sbRows = await db
    .select({ id: hands.id })
    .from(hands)
    .where(eq(hands.sbId, playerId));

  const dealerHandIds = new Set(dealerRows.map((h) => h.id));
  const sbHandIds = new Set(sbRows.map((h) => h.id));

  const dealerHands = dealerHandIds.size;
  const dealerWins = myHands.filter((h) => h.won && dealerHandIds.has(h.handId)).length;
  const dealerWinRate = dealerHands > 0 ? Math.round((dealerWins / dealerHands) * 100) : 0;

  const sbHands = sbHandIds.size;
  const sbWins = myHands.filter((h) => h.won && sbHandIds.has(h.handId)).length;
  const sbWinRate = sbHands > 0 ? Math.round((sbWins / sbHands) * 100) : 0;

  // ─── Clutch factor (how often the player reaches heads-up) ──────────────

  const headsUpFinishes = positions.filter((p) => p <= 2).length;
  const clutchFactor =
    sessionsPlayed > 0
      ? Math.round((headsUpFinishes / sessionsPlayed) * 100)
      : 0;

  // ─── Best comeback ──────────────────────────────────────────────────────

  // Session where player went all-in most times but still finished top 3
  let bestComeback: { allIns: number; position: number } | null = null;

  // myHands already carries the session of each hand, so the all-ins per
  // session are counted in memory — no extra query per session.
  const allInsBySession = new Map<string, number>();
  for (const h of myHands) {
    if (!h.wentAllIn) continue;
    allInsBySession.set(h.sessionId, (allInsBySession.get(h.sessionId) || 0) + 1);
  }

  for (const s of closedSessions) {
    if (s.finishPosition! > 3) continue;
    const sessionAllIns = allInsBySession.get(s.sessionId) || 0;
    if (sessionAllIns >= 2 && (!bestComeback || sessionAllIns > bestComeback.allIns)) {
      bestComeback = { allIns: sessionAllIns, position: s.finishPosition! };
    }
  }

  // ─── Drink stats ────────────────────────────────────────────────────────

  const totalDrinks = myHands.reduce((s, h) => s + h.drinks, 0);
  const drinksPerSession = sessionsPlayed > 0 ? Math.round((totalDrinks / sessionsPlayed) * 10) / 10 : 0;

  // Win rate in hands where they had drinks vs not
  const handsWithDrinks = myHands.filter((h) => h.drinks > 0 && h.participated);
  const handsWithoutDrinks = myHands.filter((h) => h.drinks === 0 && h.participated);
  const winRateDrunk = handsWithDrinks.length > 0 ? Math.round((handsWithDrinks.filter((h) => h.won).length / handsWithDrinks.length) * 100) : 0;
  const winRateSober = handsWithoutDrinks.length > 0 ? Math.round((handsWithoutDrinks.filter((h) => h.won).length / handsWithoutDrinks.length) * 100) : 0;

  // ─── Current streak ─────────────────────────────────────────────────────
  //
  // Shared with the live view (lib/player-relations.ts) so both always agree.

  const currentStreak = sharedRelations.currentStreak;

  // ─── Revivals ───────────────────────────────────────────────────────────

  const revivals = await db
    .select({
      leftPlayerId: substitutions.leftPlayerId,
    })
    .from(substitutions)
    .where(eq(substitutions.revivedPlayerId, playerId));

  const timesRevived = revivals.length;
  let revivedBy: PlayerRelation | null = null;
  if (timesRevived > 0) {
    // Who revived them most (leftPlayerId = the one who gave chips)
    const reviverCounts = new Map<string, number>();
    for (const r of revivals) {
      reviverCounts.set(r.leftPlayerId, (reviverCounts.get(r.leftPlayerId) || 0) + 1);
    }
    const [topReviverId, count] = [...reviverCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0];
    const [reviverPlayer] = await db.select().from(players).where(eq(players.id, topReviverId));
    if (reviverPlayer) {
      revivedBy = {
        playerId: topReviverId,
        name: reviverPlayer.name,
        nickname: reviverPlayer.nickname,
        detail: `Te dio fichas ${count} ${count === 1 ? "vez" : "veces"}`,
      };
    }
  }

  // ─── Signature winning hand ─────────────────────────────────────────────
  //
  // Derived from myHands (already filtered to this player) instead of a
  // second join over hand_players.

  const typeCounts = new Map<string, number>();
  for (const h of myHands) {
    if (!h.won || !h.winningHandType) continue;
    typeCounts.set(h.winningHandType, (typeCounts.get(h.winningHandType) || 0) + 1);
  }
  let signatureHand: PlayerProfile["signatureHand"] = null;
  if (typeCounts.size > 0) {
    const [sigType, count] = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    signatureHand = {
      label: HAND_TYPE_LABELS[sigType]?.es || sigType,
      emoji: HAND_TYPE_LABELS[sigType]?.emoji || "🃏",
      count,
    };
  }

  // ─── Archetype classification (window) ──────────────────────────────────

  const windowHandsSeen = windowHands.length;
  const windowParticipated = windowHands.filter((h) => h.participated).length;
  const windowWon = windowHands.filter((h) => h.won).length;
  const windowAllIns = windowHands.filter((h) => h.wentAllIn).length;
  const windowAllInsSurvived = windowHands.filter(
    (h) => h.wentAllIn && !h.eliminated
  ).length;

  const windowAllInRate =
    windowHandsSeen > 0 ? (windowAllIns / windowHandsSeen) * 100 : 0;
  const windowConversion =
    windowParticipated > 0 ? (windowWon / windowParticipated) * 100 : 0;
  const windowSurvival =
    windowAllIns > 0 ? (windowAllInsSurvived / windowAllIns) * 100 : 0;
  const windowKillRate =
    windowHandsSeen > 0 ? (windowKills / windowHandsSeen) * 100 : 0;

  const windowSessionCount = windowSessions.length;
  const windowWins = windowSessions.filter((s) => s.finishPosition === 1).length;
  const windowPodiums = windowSessions.filter((s) => s.finishPosition! <= 3).length;
  const windowHeadsUps = windowSessions.filter((s) => s.finishPosition! <= 2).length;
  const windowWinRate =
    windowSessionCount > 0 ? (windowWins / windowSessionCount) * 100 : 0;
  const windowPodiumRate =
    windowSessionCount > 0 ? (windowPodiums / windowSessionCount) * 100 : 0;
  const windowHeadsUpRate =
    windowSessionCount > 0 ? (windowHeadsUps / windowSessionCount) * 100 : 0;

  const windowPercentiles = windowSessions.map(
    (s) => (s.finishPosition! - 1) / Math.max(1, s.playerCount - 1)
  );
  const windowMeanPercentile =
    windowPercentiles.length > 0
      ? windowPercentiles.reduce((sum, p) => sum + p, 0) /
        windowPercentiles.length
      : 0;
  const windowVariance =
    windowPercentiles.length > 0
      ? windowPercentiles.reduce(
          (sum, p) => sum + (p - windowMeanPercentile) ** 2,
          0
        ) / windowPercentiles.length
      : 0;
  const windowPosPercentile = windowMeanPercentile * 100;
  const windowVolatility = Math.sqrt(windowVariance) * 100;

  const style = classifyArchetype({
    sessions: windowSessionCount,
    handsSeen: windowHandsSeen,
    allIns: windowAllIns,
    allInRate: windowAllInRate,
    conversion: windowConversion,
    survival: windowSurvival,
    killRate: windowKillRate,
    headsUpRate: windowHeadsUpRate,
    winRate: windowWinRate,
    podiumRate: windowPodiumRate,
    posPercentile: windowPosPercentile,
    volatility: windowVolatility,
  });

  // ─── Danger level ───────────────────────────────────────────────────────

  const dangerLevel = calculateDanger(handWinRate, kills, allInSurvivalRate, wins, sessionsPlayed);

  // ─── Badges ─────────────────────────────────────────────────────────────

  const badges = generateBadges({
    wins, podiums, sessionsPlayed, kills, allIns, allInSurvivalRate,
    handsWon, foldRate, totalDrinks, timesRevived, currentStreak, bestComeback,
  });

  return {
    id: player.id,
    name: player.name,
    nickname: player.nickname,
    photoUrl: player.photoUrl ?? null,
    style,
    dangerLevel,
    window: {
      sessions: windowSessionCount,
      handsSeen: windowHandsSeen,
      allInRate: Math.round(windowAllInRate),
      conversion: Math.round(windowConversion),
      survival: Math.round(windowSurvival),
      killRate: Math.round(windowKillRate),
      headsUpRate: Math.round(windowHeadsUpRate),
      winRate: Math.round(windowWinRate),
      posPercentile: Math.round(windowPosPercentile),
      volatility: Math.round(windowVolatility * 10) / 10,
      allIns: windowAllIns,
    },
    favoriteVictim,
    nemesis,
    kryptonite,
    sessionsPlayed,
    wins,
    podiums,
    avgPosition,
    bestPosition,
    worstPosition,
    handsPlayed,
    handsWon,
    handWinRate,
    foldRate,
    allIns,
    allInsWon,
    allInSurvivalRate,
    kills,
    dealerWinRate,
    dealerHands,
    sbWinRate,
    sbHands,
    clutchFactor,
    bestComeback,
    drinkStats: { total: totalDrinks, perSession: drinksPerSession, winRateSober, winRateDrunk },
    currentStreak,
    signatureHand,
    badges,
    timesRevived,
    revivedBy,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ArchetypeMetrics = {
  sessions: number;
  handsSeen: number;
  allIns: number;
  allInRate: number;
  conversion: number;
  survival: number;
  killRate: number;
  headsUpRate: number;
  winRate: number;
  podiumRate: number;
  posPercentile: number;
  volatility: number;
};

type ArchetypeTraits = {
  aggression: number;
  lethality: number;
  conversion: number;
  finish: number;
  depth: number;
  survival: number;
  volatility: number;
  podium: number;
  wins: number;
};

type ArchetypeDefinition = {
  id: Exclude<ArchetypeId, "camaleon" | "polluelo">;
  name: string;
  emoji: string;
  description: string;
  // Only players who clearly match the animal's signature are eligible.
  gate: (m: ArchetypeMetrics) => boolean;
  // Ranks the eligible animals. Traits are normalized 0-100.
  score: (t: ArchetypeTraits) => number;
};

const ARCHETYPE_DEFINITIONS: ArchetypeDefinition[] = [
  {
    id: "tiburon",
    name: "Tiburón",
    emoji: "🦈",
    description: "Paciente. Huele sangre. Cobra.",
    gate: (m) =>
      m.conversion >= 18 && m.posPercentile <= 40 && m.killRate >= 2,
    score: (t) =>
      0.3 * t.finish +
      0.25 * t.depth +
      0.2 * t.conversion +
      0.25 * t.lethality,
  },
  {
    id: "tortuga",
    name: "Tortuga",
    emoji: "🐢",
    description: "Vive escondida. Solo saca la cabeza con premium.",
    gate: (m) => m.allInRate <= 12 && m.killRate <= 2,
    score: (t) =>
      0.5 * (100 - t.aggression) +
      0.3 * (100 - t.lethality) +
      0.2 * (100 - t.conversion),
  },
  {
    id: "jabali",
    name: "Jabalí",
    emoji: "🐗",
    description: "Entra a todo y embiste. Sin freno.",
    gate: (m) => m.allInRate >= 17 && m.posPercentile >= 50,
    score: (t) =>
      0.6 * t.aggression + 0.15 * t.lethality + 0.25 * (100 - t.finish),
  },
  {
    id: "dodo",
    name: "Dodo",
    emoji: "🦤",
    description: "Especie extinta: se muere en cada all-in.",
    gate: (m) => m.allInRate >= 17 && m.survival <= 60 && m.allIns >= 3,
    score: (t) =>
      0.3 * t.aggression +
      0.5 * (100 - t.survival) +
      0.2 * (100 - t.finish),
  },
  {
    id: "rinoceronte",
    name: "Rinoceronte",
    emoji: "🦏",
    description: "Mucho volumen, mucho daño. Pasa por encima.",
    gate: (m) => m.killRate >= 4 && m.allInRate >= 12,
    score: (t) =>
      0.45 * t.lethality + 0.25 * t.aggression + 0.3 * t.finish,
  },
  {
    id: "cocodrilo",
    name: "Cocodrilo",
    emoji: "🐊",
    description: "Parece muerto. No lo está. No lo vas a matar.",
    gate: (m) => m.survival >= 85 && m.allInRate >= 10 && m.allIns >= 3,
    score: (t) =>
      0.45 * t.survival +
      0.2 * t.finish +
      0.2 * t.depth +
      0.15 * (100 - t.lethality),
  },
  {
    id: "serpiente",
    name: "Serpiente",
    emoji: "🐍",
    description: "Pocas manos. Una mordida. Se acabó.",
    gate: (m) => m.conversion >= 22 && m.allInRate <= 12,
    score: (t) =>
      0.55 * t.conversion +
      0.25 * (100 - t.aggression) +
      0.2 * t.finish,
  },
  {
    id: "canguro",
    name: "Canguro",
    emoji: "🦘",
    description: "Hoy salta al podio, mañana se hunde.",
    gate: (m) => m.volatility >= 30 && m.winRate <= 20,
    score: (t) =>
      0.55 * t.volatility + 0.25 * t.podium + 0.2 * (100 - t.finish),
  },
  {
    id: "zorro",
    name: "Zorro",
    emoji: "🦊",
    description: "Llega a la final y se queda mirando.",
    gate: (m) => m.headsUpRate >= 40 && m.winRate <= 20,
    score: (t) =>
      0.45 * t.depth + 0.35 * (100 - t.wins) + 0.2 * t.finish,
  },
];

const FALLBACK_ARCHETYPES: Record<
  "camaleon" | "polluelo",
  { name: string; emoji: string; description: string }
> = {
  camaleon: {
    name: "Camaleón",
    emoji: "🦎",
    description: "No hay patrón. Nadie sabe qué va a hacer.",
  },
  polluelo: {
    name: "Polluelo",
    emoji: "🐣",
    description: "Muestra chica. Todavía no se sabe.",
  },
};

/** Clamp a value into 0-100. */
function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Linear 0-100 ramp: `lo` maps to 0, `hi` maps to 100. */
function ramp(value: number, lo: number, hi: number): number {
  if (hi === lo) return value >= hi ? 100 : 0;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

function buildArchetypeTraits(m: ArchetypeMetrics): ArchetypeTraits {
  return {
    aggression: ramp(m.allInRate, 6, 22),
    lethality: ramp(m.killRate, 0, 7),
    conversion: ramp(m.conversion, 9, 25),
    finish: ramp(80 - m.posPercentile, 20, 60),
    depth: ramp(m.headsUpRate, 0, 60),
    survival: ramp(m.survival, 40, 95),
    volatility: ramp(m.volatility, 20, 36),
    podium: ramp(m.podiumRate, 0, 60),
    wins: ramp(m.winRate, 0, 40),
  };
}

function windowSummary(m: ArchetypeMetrics): string {
  const survival =
    m.allIns > 0 ? `${Math.round(m.survival)}%` : "sin all-ins";
  return `Últimas ${m.sessions} sesiones · ${m.handsSeen} manos vistas. All-in ${Math.round(m.allInRate)}% · Conversión ${Math.round(m.conversion)}% · Supervivencia ${survival} · Kills ${Math.round(m.killRate)}%.`;
}

function classifyArchetype(m: ArchetypeMetrics): PlayerStyle {
  if (m.handsSeen < ARCHETYPE_MIN_HANDS || m.sessions < ARCHETYPE_MIN_SESSIONS) {
    return {
      id: "polluelo",
      ...FALLBACK_ARCHETYPES.polluelo,
      evidence: `Muestra chica: ${m.handsSeen} manos vistas en ${m.sessions} sesiones. Hacen falta ${ARCHETYPE_MIN_HANDS} manos y ${ARCHETYPE_MIN_SESSIONS} sesiones para perfilar.`,
    };
  }

  const traits = buildArchetypeTraits(m);
  const candidates = ARCHETYPE_DEFINITIONS.filter((a) => a.gate(m))
    .map((a) => ({ ...a, score: a.score(traits) }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0 || candidates[0].score < 55) {
    const nearMiss = candidates[0];
    return {
      id: "camaleon",
      ...FALLBACK_ARCHETYPES.camaleon,
      evidence: nearMiss
        ? `Sin patrón dominante. ${nearMiss.name} queda cerca, pero no alcanza. ${windowSummary(m)}`
        : `Sin patrón dominante. ${windowSummary(m)}`,
    };
  }

  const winner = candidates[0];
  return {
    id: winner.id,
    name: winner.name,
    emoji: winner.emoji,
    description: winner.description,
    evidence: windowSummary(m),
  };
}

function calculateDanger(
  winRate: number, kills: number, allInSurvival: number,
  wins: number, sessions: number
): number {
  let score = 0;
  if (winRate > 20) score += 2;
  else if (winRate > 15) score += 1;
  if (kills > 10) score += 2;
  else if (kills > 5) score += 1;
  if (allInSurvival > 70) score += 1;
  if (sessions > 0 && (wins / sessions) > 0.3) score += 1;
  return Math.min(5, Math.max(1, score));
}

function generateBadges(stats: {
  wins: number; podiums: number; sessionsPlayed: number; kills: number;
  allIns: number; allInSurvivalRate: number; handsWon: number; foldRate: number;
  totalDrinks: number; timesRevived: number;
  currentStreak: { type: string; count: number };
  bestComeback: { allIns: number; position: number } | null;
}): { emoji: string; title: string; detail: string }[] {
  const badges: { emoji: string; title: string; detail: string }[] = [];

  if (stats.wins >= 5) badges.push({ emoji: "👑", title: "Pentacampeón", detail: `${stats.wins} victorias` });
  else if (stats.wins >= 3) badges.push({ emoji: "🏆", title: "Tricampeón", detail: `${stats.wins} victorias` });
  else if (stats.wins >= 1) badges.push({ emoji: "⭐", title: "Campeón", detail: `${stats.wins} victoria${stats.wins > 1 ? "s" : ""}` });

  if (stats.podiums >= 10) badges.push({ emoji: "🥉", title: "Podio de Oro", detail: `${stats.podiums} podios` });

  if (stats.kills >= 15) badges.push({ emoji: "💀", title: "Serial Killer", detail: `${stats.kills} eliminaciones` });
  else if (stats.kills >= 8) badges.push({ emoji: "🗡️", title: "Asesino", detail: `${stats.kills} eliminaciones` });

  if (stats.allIns >= 30) badges.push({ emoji: "🤠", title: "All-In Addict", detail: `${stats.allIns} all-ins` });

  if (stats.allInSurvivalRate >= 80 && stats.allIns >= 10) badges.push({ emoji: "🛡️", title: "Blindado", detail: `${stats.allInSurvivalRate}% survival` });

  if (stats.handsWon >= 50) badges.push({ emoji: "🖐️", title: "Manos de Oro", detail: `${stats.handsWon} manos ganadas` });

  if (stats.foldRate >= 40) badges.push({ emoji: "🪨", title: "Tight Player", detail: `${stats.foldRate}% fold rate` });

  if (stats.totalDrinks >= 30) badges.push({ emoji: "🍺", title: "Hígado de Acero", detail: `${stats.totalDrinks} cervezas` });

  if (stats.timesRevived >= 2) badges.push({ emoji: "🧟", title: "El Zombie", detail: `Revivido ${stats.timesRevived} veces` });

  if (stats.currentStreak.type === "win" && stats.currentStreak.count >= 3) {
    badges.push({ emoji: "🔥", title: "En Llamas", detail: `${stats.currentStreak.count} wins seguidos` });
  }

  if (stats.bestComeback && stats.bestComeback.allIns >= 3) {
    badges.push({ emoji: "🦅", title: "Comeback King", detail: `${stats.bestComeback.allIns} all-ins → ${stats.bestComeback.position}º` });
  }

  if (stats.sessionsPlayed >= 15) badges.push({ emoji: "🎖️", title: "Veterano", detail: `${stats.sessionsPlayed} sesiones` });

  return badges;
}
