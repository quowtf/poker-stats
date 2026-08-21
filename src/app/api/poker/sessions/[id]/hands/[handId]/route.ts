import { NextResponse } from "next/server";
import { db } from "@/db";
import { hands, handPlayers, players } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; handId: string }> }
) {
  try {
    const { handId } = await params;

    const [hand] = await db
      .select()
      .from(hands)
      .where(eq(hands.id, handId));

    if (!hand) {
      return NextResponse.json({ error: "Hand not found" }, { status: 404 });
    }

    const handPlayersList = await db
      .select({
        playerId: handPlayers.playerId,
        playerName: players.name,
        playerNickname: players.nickname,
        participated: handPlayers.participated,
        wentAllIn: handPlayers.wentAllIn,
        won: handPlayers.won,
        eliminated: handPlayers.eliminated,
      })
      .from(handPlayers)
      .innerJoin(players, eq(handPlayers.playerId, players.id))
      .where(eq(handPlayers.handId, handId));

    return NextResponse.json({ ...hand, players: handPlayersList });
  } catch (error) {
    console.error("Error fetching hand:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; handId: string }> }
) {
  try {
    const { handId } = await params;

    const [deleted] = await db
      .delete(hands)
      .where(eq(hands.id, handId))
      .returning({ id: hands.id });

    if (!deleted) {
      return NextResponse.json({ error: "Hand not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Hand deleted", id: deleted.id });
  } catch (error) {
    console.error("Error deleting hand:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
