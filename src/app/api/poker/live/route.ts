import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  sessions,
  sessionInsights,
  hands,
  handPlayers,
  players,
} from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";

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
      .select({ id: hands.id, handNumber: hands.handNumber })
      .from(hands)
      .where(eq(hands.sessionId, liveSession.id))
      .orderBy(asc(hands.handNumber));

    const handIds = sessionHands.map((h) => h.id);

    // Get hand_players for all hands in this session
    let ranking: { playerId: string; name: string; nickname: string | null; handsWon: number; handsPlayed: number; handsFolded: number; allIns: number; isEliminated: boolean }[] = [];

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
        .map(([playerId, data]) => ({ playerId, ...data }))
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

    return NextResponse.json({
      isLive: true,
      isFinished,
      winner: isFinished ? alivePlayers[0] : null,
      session: {
        id: liveSession.id,
        playedAt: liveSession.playedAt,
        playerCount: liveSession.playerCount,
        handCount: sessionHands.length,
      },
      ranking,
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
