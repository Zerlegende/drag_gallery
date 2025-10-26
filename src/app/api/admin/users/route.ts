import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { username, password, role } = body;

    // Validierung
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username und Passwort sind erforderlich" },
        { status: 400 }
      );
    }

    if (!role || !["admin", "user"].includes(role)) {
      return NextResponse.json(
        { error: "Ungültige Rolle" },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username muss mindestens 3 Zeichen lang sein" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Passwort muss mindestens 8 Zeichen lang sein" },
        { status: 400 }
      );
    }

    // Prüfen ob Username bereits existiert
    const existingUsers = await query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: "Username existiert bereits" },
        { status: 409 }
      );
    }

    // Passwort hashen
    const hashedPassword = await bcrypt.hash(password, 10);

    // User erstellen
    const newUsers = await query<{ id: string }>(
      `INSERT INTO users (username, hashed_password, role) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      [username, hashedPassword, role]
    );

    return NextResponse.json({ 
      success: true, 
      userId: newUsers[0].id 
    });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
