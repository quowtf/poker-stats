import { NextResponse } from "next/server";
import { db } from "@/db";
import { hands, handPlayers, sessions, players } from "@/db/schema";
import { createHandSchema } from "@/lib/validations";
import { eq, asc, and, count } from "drizzle-orm";

export async function GET(
  _request: Request,
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

    // Get all hands with their players
    const allHands = await db
      .select()
      .from(hands)
      .where(eq(hands.sessionId, sessionId))
      .orderBy(asc(hands.handNumber));

    const result = await Promise.all(
      allHands.map(async (hand) => {
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
          .where(eq(handPlayers.handId, hand.id));

        return { ...hand, players: handPlayersList };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching hands:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const parsed = createHandSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { players: handPlayersInput, dealerId, sbId, winningHandType } = parsed.data;

    // Get next hand number
    const [countResult] = await db
      .select({ total: count() })
      .from(hands)
      .where(eq(hands.sessionId, sessionId));

    const handNumber = countResult.total + 1;

    // Create hand with dealer/sb
    const [newHand] = await db
      .insert(hands)
      .values({
        sessionId,
        handNumber,
        dealerId: dealerId ?? null,
        sbId: sbId ?? null,
        winningHandType: winningHandType ?? null,
      })
      .returning();

    // Infer elimination: all-in + not won = eliminated
    const handPlayerValues = handPlayersInput.map((p) => {
      const eliminated = p.wentAllIn && !p.won && p.participated;
      return {
        handId: newHand.id,
        playerId: p.playerId,
        participated: p.participated,
        wentAllIn: p.wentAllIn,
        won: p.won,
        eliminated,
        drinks: p.drinks,
      };
    });

    await db.insert(handPlayers).values(handPlayerValues);

    // Generate insights for this hand (non-blocking)
    const { generateInsightsForHand } = await import("@/lib/insights");
    generateInsightsForHand(sessionId, newHand.id).catch((err) =>
      console.error("Error generating insights:", err)
    );

    // Return hand with players
    const createdPlayers = await db
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
      .where(eq(handPlayers.handId, newHand.id));

    return NextResponse.json(
      { ...newHand, players: createdPlayers },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating hand:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
