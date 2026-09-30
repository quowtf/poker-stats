import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, sessionPlayers, players } from "@/db/schema";
import { updateSeatOrderSchema } from "@/lib/validations";
import { and, eq, sql } from "drizzle-orm";

/**
 * PATCH: persist a new clockwise table order for a session's players.
 * Body: { playerIds: string[] } in the desired order (index becomes seatOrder).
 * The list must match exactly the players registered in the session.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Verify session exists
    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateSeatOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { playerIds } = parsed.data;

    // The provided list must match the session's players exactly
    const existing = await db
      .select({ playerId: sessionPlayers.playerId })
      .from(sessionPlayers)
      .where(eq(sessionPlayers.sessionId, sessionId));

    const existingIds = new Set(existing.map((p) => p.playerId));
    const providedIds = new Set(playerIds);

    const sameSize = existingIds.size === providedIds.size;
    const sameMembers = [...providedIds].every((pid) => existingIds.has(pid));

    if (!sameSize || !sameMembers) {
      return NextResponse.json(
        { error: "playerIds must match the session's players exactly" },
        { status: 400 }
      );
    }

    // Update seatOrder = index for each player. Small player count (<=9),
    // so per-row updates are fine and keep the logic simple.
    await Promise.all(
      playerIds.map((playerId, index) =>
        db
          .update(sessionPlayers)
          .set({ seatOrder: index })
          .where(
            and(
              eq(sessionPlayers.sessionId, sessionId),
              eq(sessionPlayers.playerId, playerId)
            )
          )
      )
    );

    // Return players in the new order
    const ordered = await db
      .select({
        playerId: sessionPlayers.playerId,
        playerName: players.name,
        playerNickname: players.nickname,
        finishPosition: sessionPlayers.finishPosition,
        seatOrder: sessionPlayers.seatOrder,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, sessionId))
      .orderBy(sql`${sessionPlayers.seatOrder} asc nulls last`);

    return NextResponse.json({ sessionId, players: ordered });
  } catch (error) {
    console.error("Error updating seat order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
