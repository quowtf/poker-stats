import { NextResponse } from "next/server";
import { db } from "@/db";
import { players } from "@/db/schema";
import { createPlayerSchema } from "@/lib/validations";
import { asc } from "drizzle-orm";

export async function GET() {
  try {
    const allPlayers = await db
      .select()
      .from(players)
      .orderBy(asc(players.name));

    return NextResponse.json(allPlayers);
  } catch (error) {
    console.error("Error fetching players:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createPlayerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, nickname } = parsed.data;

    const [newPlayer] = await db
      .insert(players)
      .values({ name, nickname: nickname ?? null })
      .returning();

    return NextResponse.json(newPlayer, { status: 201 });
  } catch (error) {
    console.error("Error creating player:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
