import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    
    // Prevent self-deletion
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Du kannst dich nicht selbst löschen" },
        { status: 400 }
      );
    }

    await query("DELETE FROM users WHERE id = $1", [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { role, username, password } = body;

    // Handle role update
    if (role !== undefined) {
      if (!["admin", "user"].includes(role)) {
        return NextResponse.json(
          { error: "Invalid role" },
          { status: 400 }
        );
      }

      // Prevent self-demotion
      if (id === session.user.id) {
        return NextResponse.json(
          { error: "Du kannst deine eigene Rolle nicht ändern" },
          { status: 400 }
        );
      }

      await query("UPDATE users SET role = $1 WHERE id = $2", [role, id]);
    }

    // Handle username update
    if (username !== undefined) {
      const trimmedUsername = username.trim();
      
      if (!trimmedUsername) {
        return NextResponse.json(
          { error: "Username darf nicht leer sein" },
          { status: 400 }
        );
      }

      // Check if username already exists (for another user)
      const existing = await query<{ id: string }>(
        "SELECT id FROM users WHERE username = $1 AND id != $2",
        [trimmedUsername, id]
      );

      if (existing.length > 0) {
        return NextResponse.json(
          { error: "Username bereits vergeben" },
          { status: 400 }
        );
      }

      await query("UPDATE users SET username = $1 WHERE id = $2", [trimmedUsername, id]);
    }

    // Handle password update
    if (password !== undefined) {
      const trimmedPassword = password.trim();
      
      if (!trimmedPassword) {
        return NextResponse.json(
          { error: "Passwort darf nicht leer sein" },
          { status: 400 }
        );
      }

      if (trimmedPassword.length < 4) {
        return NextResponse.json(
          { error: "Passwort muss mindestens 4 Zeichen lang sein" },
          { status: 400 }
        );
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
      
      await query("UPDATE users SET hashed_password = $1 WHERE id = $2", [hashedPassword, id]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
