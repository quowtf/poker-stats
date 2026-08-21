import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, sessionPlayers, hands, handPlayers } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";

/**
 * POST /api/poker/sessions/:id/close
 *
 * Auto-calculates finish positions from elimination order in hands:
 * - First eliminated = last place
 * - Last eliminated = 2nd place
 * - Never eliminated = 1st place
 *
 * Also sets cashOut (winner gets all buy-ins) and deactivates live.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Verify session exists
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check not already closed
    const existingPositions = await db
      .select({ pos: sessionPlayers.finishPosition })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId));

    if (existingPositions.some((p) => p.pos !== null)) {
      return NextResponse.json(
        { error: "Session already closed" },
        { status: 400 }
      );
    }

    // Get all hands in order
    const sessionHands = await db
      .select({ id: hands.id, handNumber: hands.handNumber })
      .from(hands)
      .where(eq(hands.sessionId, sessionId))
      .orderBy(asc(hands.handNumber));

    // Get all session players
    const sPlayers = await db
      .select({ id: sessionPlayers.id, playerId: sessionPlayers.playerId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId));

    const playerCount = sPlayers.length;

    // Determine elimination order from hands
    const eliminationOrder: string[] = []; // player IDs in order of elimination

    for (const hand of sessionHands) {
      const hPlayers = await db
        .select({
          playerId: handPlayers.playerId,
          eliminated: handPlayers.eliminated,
        })
        .from(handPlayers)
        .where(eq(handPlayers.handId, hand.id));

      for (const hp of hPlayers) {
        if (hp.eliminated && !eliminationOrder.includes(hp.playerId)) {
          eliminationOrder.push(hp.playerId);
        }
      }
    }

    // Players never eliminated = survivors (should be 1 for a completed game)
    const allPlayerIds = sPlayers.map((sp) => sp.playerId);
    const survivors = allPlayerIds.filter((id) => !eliminationOrder.includes(id));

    // Assign positions:
    // Survivors get top positions (if multiple, they share 1st — but normally just 1)
    // Then reverse elimination order for the rest
    const positionMap = new Map<string, number>();

    // Survivors get positions 1, 2, 3... (normally just 1 survivor = 1st place)
    survivors.forEach((id, i) => {
      positionMap.set(id, i + 1);
    });

    // Eliminated in reverse order (last eliminated = next best position)
    const nextPosition = survivors.length + 1;
    for (let i = eliminationOrder.length - 1; i >= 0; i--) {
      positionMap.set(eliminationOrder[i], nextPosition + (eliminationOrder.length - 1 - i));
    }

    // Update session_players with positions and cashOut
    const totalPot = playerCount * 100; // $100 buy-in each
    for (const sp of sPlayers) {
      const position = positionMap.get(sp.playerId) || playerCount;
      await db
        .update(sessionPlayers)
        .set({
          finishPosition: position,
          cashOut: position === 1 ? totalPot : 0,
        })
        .where(eq(sessionPlayers.id, sp.id));
    }

    // Deactivate live
    await db
      .update(sessions)
      .set({ isLive: false })
      .where(eq(sessions.id, sessionId));

    return NextResponse.json({
      message: "Session closed",
      positions: Object.fromEntries(positionMap),
      eliminationOrder: eliminationOrder.length,
      survivors: survivors.length,
    });
  } catch (error) {
    console.error("Error closing session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
