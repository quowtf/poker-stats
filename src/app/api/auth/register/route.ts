import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { z } from "zod";
import { count } from "drizzle-orm";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    // Check if any users exist
    const [result] = await db.select({ total: count() }).from(users);
    const hasUsers = result.total > 0;

    if (hasUsers) {
      return NextResponse.json(
        { error: "Registration is closed. Contact admin." },
        { status: 403 }
      );
    }

    // First user becomes admin
    const passwordHash = await hash(password, 12);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role: "admin",
      })
      .returning({ id: users.id, email: users.email, role: users.role });

    return NextResponse.json(
      { message: "Admin user created", user: newUser },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
