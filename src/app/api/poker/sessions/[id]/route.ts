import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, sessionPlayers, players } from "@/db/schema";
import { createSessionSchema } from "@/lib/validations";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id));

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sessionPlayersList = await db
      .select({
        playerId: sessionPlayers.playerId,
        playerName: players.name,
        playerNickname: players.nickname,
        finishPosition: sessionPlayers.finishPosition,
        buyIn: sessionPlayers.buyIn,
        cashOut: sessionPlayers.cashOut,
        joinedAt: sessionPlayers.joinedAt,
        leftAt: sessionPlayers.leftAt,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, id))
      .orderBy(sessionPlayers.finishPosition);

    return NextResponse.json({ ...session, players: sessionPlayersList });
  } catch (error) {
    console.error("Error fetching session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify session exists
    const [existing] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, id));

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { playedAt, players: playerInputs, notes } = parsed.data;
    const date = playedAt || new Date().toISOString().split("T")[0];

    // Update session
    const [updated] = await db
      .update(sessions)
      .set({
        playedAt: date,
        playerCount: playerInputs.length,
        notes: notes ?? null,
      })
      .where(eq(sessions.id, id))
      .returning();

    // Delete old session_players and recreate
    await db.delete(sessionPlayers).where(eq(sessionPlayers.sessionId, id));

    const sessionPlayerValues = playerInputs.map((p) => ({
      sessionId: id,
      playerId: p.playerId,
      finishPosition: p.finishPosition,
      buyIn: p.buyIn ?? null,
      cashOut: p.cashOut ?? null,
      drinks: p.drinks ?? null,
    }));

    await db.insert(sessionPlayers).values(sessionPlayerValues);

    // Return updated session with players
    const updatedPlayers = await db
      .select({
        playerId: sessionPlayers.playerId,
        playerName: players.name,
        playerNickname: players.nickname,
        finishPosition: sessionPlayers.finishPosition,
        buyIn: sessionPlayers.buyIn,
        cashOut: sessionPlayers.cashOut,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, id))
      .orderBy(sessionPlayers.finishPosition);

    return NextResponse.json({ ...updated, players: updatedPlayers });
  } catch (error) {
    console.error("Error updating session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(sessions)
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });

    if (!deleted) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Session deleted", id: deleted.id });
  } catch (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
