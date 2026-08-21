import { NextResponse } from "next/server";
import { db } from "@/db";
import { substitutions, hands, sessions } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { z } from "zod";

const substituteSchema = z.object({
  leftPlayerId: z.string().uuid(),    // alive player who is leaving
  revivedPlayerId: z.string().uuid(), // eliminated player who comes back
});

/**
 * POST /api/poker/sessions/:id/substitute
 * Record a substitution: alive player leaves, gives chips to eliminated player.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = substituteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { leftPlayerId, revivedPlayerId } = parsed.data;

    // Get current hand number
    const [countResult] = await db
      .select({ total: count() })
      .from(hands)
      .where(eq(hands.sessionId, sessionId));

    const [sub] = await db
      .insert(substitutions)
      .values({
        sessionId,
        handNumber: countResult.total,
        leftPlayerId,
        revivedPlayerId,
      })
      .returning();

    return NextResponse.json(sub, { status: 201 });
  } catch (error) {
    console.error("Error creating substitution:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
