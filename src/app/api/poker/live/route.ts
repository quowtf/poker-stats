import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  sessions,
  sessionPlayers,
  sessionInsights,
  hands,
  handPlayers,
  players,
} from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";

type SeatedPlayer = { playerId: string; seatOrder: number | null };

/** Active players sorted clockwise by seatOrder. */
function activeInSeatOrder(players: SeatedPlayer[]): SeatedPlayer[] {
  return [...players].sort((a, b) => (a.seatOrder ?? 0) - (b.seatOrder ?? 0));
}

/** Seat to the RIGHT (counter-clockwise = previous seatOrder, wrapping). */
function seatToRight(players: SeatedPlayer[], fromPlayerId: string | null): string | null {
  const active = activeInSeatOrder(players);
  if (active.length === 0) return null;
  if (fromPlayerId === null) return active[0].playerId;
  const idx = active.findIndex((p) => p.playerId === fromPlayerId);
  if (idx === -1) return active[0].playerId;
  return active[(idx - 1 + active.length) % active.length].playerId;
}

/** Seat to the LEFT (clockwise = next seatOrder, wrapping). */
function seatToLeft(players: SeatedPlayer[], fromPlayerId: string | null): string | null {
  const active = activeInSeatOrder(players);
  if (active.length === 0) return null;
  if (fromPlayerId === null) return active[0].playerId;
  const idx = active.findIndex((p) => p.playerId === fromPlayerId);
  if (idx === -1) return active[0].playerId;
  return active[(idx + 1) % active.length].playerId;
}

/**
 * GET /api/poker/live
 * Returns data for the live view:
 * - The session marked as is_live=true
 * - Ranking: hands won per player this session
 * - Latest 5 insights
 * - isLive flag (if false, /live page stops polling)
 */
export async function GET() {
  try {
    // Find the live session
    const [liveSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.isLive, true))
      .limit(1);

    if (!liveSession) {
      return NextResponse.json({ isLive: false, session: null, ranking: [], insights: [] });
    }

    // Get all hands for this session with players
    const sessionHands = await db
      .select({
        id: hands.id,
        handNumber: hands.handNumber,
        createdAt: hands.createdAt,
        dealerId: hands.dealerId,
        sbId: hands.sbId,
      })
      .from(hands)
      .where(eq(hands.sessionId, liveSession.id))
      .orderBy(asc(hands.handNumber));

    const handIds = sessionHands.map((h) => h.id);

    // Seat order per player (0-based clockwise); nullable → alphabetical fallback later
    const seats = await db
      .select({
        playerId: sessionPlayers.playerId,
        seatOrder: sessionPlayers.seatOrder,
        name: players.name,
        nickname: players.nickname,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, liveSession.id));
    const seatOrderMap = new Map<string, number | null>(
      seats.map((s) => [s.playerId, s.seatOrder])
    );

    // Seated players (works even before any hand is played — used by the
    // pre-game mesa view where `ranking` is still empty).
    const seatedPlayers = seats.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      nickname: s.nickname,
      handsWon: 0,
      handsPlayed: 0,
      handsFolded: 0,
      allIns: 0,
      isEliminated: false,
      seatOrder: s.seatOrder,
    }));

    // Get hand_players for all hands in this session
    let ranking: { playerId: string; name: string; nickname: string | null; handsWon: number; handsPlayed: number; handsFolded: number; allIns: number; isEliminated: boolean; seatOrder: number | null }[] = [];

    if (handIds.length > 0) {
      const allHandPlayers = await db
        .select({
          handId: handPlayers.handId,
          playerId: handPlayers.playerId,
          playerName: players.name,
          playerNickname: players.nickname,
          participated: handPlayers.participated,
          won: handPlayers.won,
          wentAllIn: handPlayers.wentAllIn,
          eliminated: handPlayers.eliminated,
        })
        .from(handPlayers)
        .innerJoin(players, eq(handPlayers.playerId, players.id))
        .innerJoin(hands, eq(handPlayers.handId, hands.id))
        .where(eq(hands.sessionId, liveSession.id));

      // Aggregate per player
      const playerMap = new Map<
        string,
        { name: string; nickname: string | null; handsWon: number; handsPlayed: number; handsFolded: number; allIns: number; isEliminated: boolean }
      >();

      for (const row of allHandPlayers) {
        const existing = playerMap.get(row.playerId) || {
          name: row.playerName,
          nickname: row.playerNickname,
          handsWon: 0,
          handsPlayed: 0,
          handsFolded: 0,
          allIns: 0,
          isEliminated: false,
        };
        if (row.participated) {
          existing.handsPlayed++;
        } else if (!existing.isEliminated) {
          existing.handsFolded++;
        }
        if (row.won) existing.handsWon++;
        if (row.wentAllIn) existing.allIns++;
        if (row.eliminated) existing.isEliminated = true;
        playerMap.set(row.playerId, existing);
      }

      ranking = [...playerMap.entries()]
        .map(([playerId, data]) => ({
          playerId,
          ...data,
          seatOrder: seatOrderMap.get(playerId) ?? null,
        }))
        .sort((a, b) => {
          if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
          return b.handsWon - a.handsWon;
        });
    }

    // Get insights from the LAST hand only (most relevant)
    const lastHand = sessionHands[sessionHands.length - 1];
    let insights: { id: string; emoji: string; message: string; type: string; createdAt: Date }[] = [];

    if (lastHand) {
      insights = await db
        .select({
          id: sessionInsights.id,
          emoji: sessionInsights.emoji,
          message: sessionInsights.message,
          type: sessionInsights.type,
          createdAt: sessionInsights.createdAt,
        })
        .from(sessionInsights)
        .where(eq(sessionInsights.handId, lastHand.id))
        .orderBy(desc(sessionInsights.createdAt))
        .limit(5);
    }

    // Check if game is finished (only 1 alive)
    const alivePlayers = ranking.filter((r) => !r.isEliminated);
    const isFinished = alivePlayers.length === 1 && ranking.length > 1;

    // ─── Scoreboard aggregates (derived from real data) ──────────────────────

    // Kills: eliminations credited to the hand winner (best-effort — the winner
    // of a hand where someone was eliminated gets the kill).
    const killMap = new Map<string, number>();
    let totalAllIns = 0;
    let totalEliminations = 0;

    if (handIds.length > 0) {
      const perHand = await db
        .select({
          handId: handPlayers.handId,
          playerId: handPlayers.playerId,
          won: handPlayers.won,
          wentAllIn: handPlayers.wentAllIn,
          eliminated: handPlayers.eliminated,
        })
        .from(handPlayers)
        .innerJoin(hands, eq(handPlayers.handId, hands.id))
        .where(eq(hands.sessionId, liveSession.id));

      const byHand = new Map<string, { winnerId: string | null; elims: number }>();
      for (const row of perHand) {
        const h = byHand.get(row.handId) || { winnerId: null, elims: 0 };
        if (row.won) h.winnerId = row.playerId;
        if (row.eliminated) { h.elims++; totalEliminations++; }
        if (row.wentAllIn) totalAllIns++;
        byHand.set(row.handId, h);
      }
      for (const { winnerId, elims } of byHand.values()) {
        if (winnerId && elims > 0) {
          killMap.set(winnerId, (killMap.get(winnerId) || 0) + elims);
        }
      }
    }

    // Chip/table leader = most hands won (among alive players).
    const leader = [...alivePlayers].sort((a, b) => b.handsWon - a.handsWon)[0] || null;

    // Top killer.
    let topKiller: { playerId: string; name: string; kills: number } | null = null;
    for (const r of ranking) {
      const kills = killMap.get(r.playerId) || 0;
      if (kills > 0 && (!topKiller || kills > topKiller.kills)) {
        topKiller = { playerId: r.playerId, name: r.nickname || r.name, kills };
      }
    }

    // Timing (derived from hand timestamps + session start).
    const firstHandAt = sessionHands[0]?.createdAt ?? liveSession.createdAt;
    const lastHandAt = sessionHands[sessionHands.length - 1]?.createdAt ?? null;

    // ─── Present-tense Dealer/SB (one hand AHEAD of the last saved hand) ─────
    // The last recorded hand's button has already rotated for the hand about to
    // be played. Show the CURRENT positions: dealer = seat to the right of the
    // last dealer (among alive players); SB = seat to the dealer's left.
    let presentDealerId: string | null = null;
    let presentSbId: string | null = null;
    if (lastHand?.dealerId && alivePlayers.length >= 2) {
      presentDealerId = seatToRight(alivePlayers, lastHand.dealerId);
      presentSbId = seatToLeft(alivePlayers, presentDealerId);
    }

    return NextResponse.json({
      isLive: true,
      isFinished,
      winner: isFinished ? alivePlayers[0] : null,
      session: {
        id: liveSession.id,
        playedAt: liveSession.playedAt,
        playerCount: liveSession.playerCount,
        handCount: sessionHands.length,
        startedAt: (firstHandAt instanceof Date ? firstHandAt : new Date(firstHandAt)).toISOString(),
        lastHandAt: lastHandAt ? (lastHandAt instanceof Date ? lastHandAt : new Date(lastHandAt)).toISOString() : null,
        // Present-tense button positions: rotated one hand ahead of the last
        // saved hand, so the live table reflects the hand about to be played.
        dealerId: presentDealerId,
        sbId: presentSbId,
        // Heads-up mode drives blinds shown once down to 2 players.
        headsUpMode: liveSession.headsUpMode,
      },
      scoreboard: {
        playersAlive: alivePlayers.length,
        playersOut: ranking.length - alivePlayers.length,
        totalPlayers: ranking.length,
        totalAllIns,
        totalEliminations,
        leader: leader ? { playerId: leader.playerId, name: leader.nickname || leader.name, handsWon: leader.handsWon } : null,
        topKiller,
      },
      ranking,
      seatedPlayers,
      insights: insights.reverse(),
    });
  } catch (error) {
    console.error("Error fetching live data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
