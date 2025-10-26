import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    // Validierung
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Beide Passwörter sind erforderlich" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Neues Passwort muss mindestens 8 Zeichen lang sein" },
        { status: 400 }
      );
    }

    // Aktuellen User aus DB holen
    const users = await query<{ id: string; hashed_password: string }>(
      "SELECT id, hashed_password FROM users WHERE id = $1",
      [session.user.id]
    );

    if (users.length === 0) {
      return NextResponse.json({ error: "User nicht gefunden" }, { status: 404 });
    }

    const user = users[0];

    // Aktuelles Passwort verifizieren
    const isValid = await bcrypt.compare(currentPassword, user.hashed_password);
    if (!isValid) {
      return NextResponse.json(
        { error: "Aktuelles Passwort ist falsch" },
        { status: 400 }
      );
    }

    // Neues Passwort hashen
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Passwort in DB aktualisieren
    await query(
      "UPDATE users SET hashed_password = $1 WHERE id = $2",
      [hashedPassword, session.user.id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
