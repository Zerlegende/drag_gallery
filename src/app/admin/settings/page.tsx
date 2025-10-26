import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { PasswordChangeForm } from "./password-change-form";
import { AvatarUpload } from "./avatar-upload";
import { env } from "@/lib/env";

export default async function SettingsPage() {
  const session = await auth();
  
  // Nur eingeloggte User dürfen diese Seite sehen
  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  // Get user avatar from database
  const userResult = await query<{ avatar: string | null }>(
    "SELECT avatar FROM users WHERE id = $1",
    [session.user.id]
  );
  const avatar = userResult[0]?.avatar;
  const avatarUrl = avatar ? `${env.client.NEXT_PUBLIC_MINIO_BASE_URL}/${avatar}` : null;

  return (
    <div className="w-full py-6 px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground mt-2">
          Verwalte deine Account-Einstellungen
        </p>
      </div>

      <div className="max-w-2xl space-y-8">
        {/* Avatar Upload */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Profilbild</h2>
          <AvatarUpload 
            userId={session.user.id!} 
            currentAvatar={avatarUrl}
            userName={session.user.name || undefined}
          />
        </div>

        {/* Account Info */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Account-Informationen</h2>
          <div className="space-y-3">
            <div>
              <span className="text-sm text-muted-foreground">Username:</span>
              <p className="font-medium">{session.user.name}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Rolle:</span>
              <p className="font-medium capitalize">{session.user.role || 'user'}</p>
            </div>
          </div>
        </div>

        {/* Password Change */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold mb-4">Passwort ändern</h2>
          <PasswordChangeForm userId={session.user.id!} />
        </div>
      </div>
    </div>
  );
}
