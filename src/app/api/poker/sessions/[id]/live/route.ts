import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/poker/sessions/:id/live
 * Toggle is_live on a session. Only one session can be live at a time.
 * Body: { isLive: boolean }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isLive } = body;

    if (typeof isLive !== "boolean") {
      return NextResponse.json(
        { error: "isLive must be a boolean" },
        { status: 400 }
      );
    }

    // If activating, deactivate all others first
    if (isLive) {
      await db.update(sessions).set({ isLive: false }).where(eq(sessions.isLive, true));
    }

    // Set this session
    const [updated] = await db
      .update(sessions)
      .set({ isLive })
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id, isLive: sessions.isLive });

    if (!updated) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: isLive ? "Session is now live" : "Live deactivated",
      session: updated,
    });
  } catch (error) {
    console.error("Error toggling live:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
