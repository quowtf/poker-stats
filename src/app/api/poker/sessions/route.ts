import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, sessionPlayers, players } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

// ─── New session schema: just players + date ─────────────────────────────────

const createSessionSchema = z.object({
  playedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .optional(),
  playerIds: z
    .array(z.string().uuid())
    .min(2, "Minimum 2 players required")
    .max(9, "Maximum 9 players allowed"),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET() {
  try {
    const allSessions = await db
      .select({
        id: sessions.id,
        playedAt: sessions.playedAt,
        playerCount: sessions.playerCount,
        isLive: sessions.isLive,
        notes: sessions.notes,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .orderBy(desc(sessions.playedAt));

    // Get winner for each session (finishPosition = 1)
    const result = await Promise.all(
      allSessions.map(async (session) => {
        const [winner] = await db
          .select({
            playerName: players.name,
            playerNickname: players.nickname,
          })
          .from(sessionPlayers)
          .innerJoin(players, eq(sessionPlayers.playerId, players.id))
          .where(eq(sessionPlayers.sessionId, session.id))
          .orderBy(sessionPlayers.finishPosition)
          .limit(1);

        // Check if session is closed (has positions assigned)
        const [anyPosition] = await db
          .select({ pos: sessionPlayers.finishPosition })
          .from(sessionPlayers)
          .where(eq(sessionPlayers.sessionId, session.id))
          .limit(1);

        const isClosed = anyPosition?.pos !== null;

        return {
          ...session,
          isClosed,
          winner: isClosed ? (winner?.playerNickname || winner?.playerName || null) : null,
        };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { playedAt, playerIds, notes } = parsed.data;
    const date = playedAt || new Date().toISOString().split("T")[0];

    // Verify all player IDs exist
    const existingPlayers = await db
      .select({ id: players.id })
      .from(players);
    const existingIds = new Set(existingPlayers.map((p) => p.id));

    const invalidIds = playerIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Invalid player IDs", invalidIds },
        { status: 400 }
      );
    }

    // Check unique player IDs
    if (new Set(playerIds).size !== playerIds.length) {
      return NextResponse.json(
        { error: "Duplicate player IDs" },
        { status: 400 }
      );
    }

    // Create session
    const [newSession] = await db
      .insert(sessions)
      .values({
        playedAt: date,
        playerCount: playerIds.length,
        notes: notes ?? null,
      })
      .returning();

    // Create session_players (no finishPosition yet — session is open)
    await db.insert(sessionPlayers).values(
      playerIds.map((playerId) => ({
        sessionId: newSession.id,
        playerId,
        finishPosition: null,
        buyIn: 100,
        cashOut: null,
      }))
    );

    // Return session with players
    const createdPlayers = await db
      .select({
        playerId: sessionPlayers.playerId,
        playerName: players.name,
        playerNickname: players.nickname,
      })
      .from(sessionPlayers)
      .innerJoin(players, eq(sessionPlayers.playerId, players.id))
      .where(eq(sessionPlayers.sessionId, newSession.id));

    return NextResponse.json(
      { ...newSession, players: createdPlayers },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
