"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordChangeForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    // Validierung
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError("Neue Passwörter stimmen nicht überein");
      setLoading(false);
      return;
    }

    if (passwords.newPassword.length < 8) {
      setError("Neues Passwort muss mindestens 8 Zeichen lang sein");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Ändern des Passworts");
      }

      setSuccess(true);
      setPasswords({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      // Nach 2 Sekunden ausloggen und zum Login weiterleiten
      setTimeout(async () => {
        await signOut({ redirect: false });
        router.push("/auth/sign-in");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-600 dark:text-green-400">
          Passwort erfolgreich geändert! Du wirst ausgeloggt...
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="current-password">Aktuelles Passwort</Label>
        <div className="relative">
          <Input
            id="current-password"
            type={showPasswords.current ? "text" : "password"}
            value={passwords.currentPassword}
            onChange={(e) =>
              setPasswords({ ...passwords, currentPassword: e.target.value })
            }
            required
            disabled={loading || success}
            placeholder="••••••••"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            disabled={loading || success}
            tabIndex={-1}
          >
            {showPasswords.current ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-password">Neues Passwort</Label>
        <div className="relative">
          <Input
            id="new-password"
            type={showPasswords.new ? "text" : "password"}
            value={passwords.newPassword}
            onChange={(e) =>
              setPasswords({ ...passwords, newPassword: e.target.value })
            }
            required
            disabled={loading || success}
            placeholder="••••••••"
            minLength={8}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            disabled={loading || success}
            tabIndex={-1}
          >
            {showPasswords.new ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Mindestens 8 Zeichen
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
        <div className="relative">
          <Input
            id="confirm-password"
            type={showPasswords.confirm ? "text" : "password"}
            value={passwords.confirmPassword}
            onChange={(e) =>
              setPasswords({ ...passwords, confirmPassword: e.target.value })
            }
            required
            disabled={loading || success}
            placeholder="••••••••"
            minLength={8}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            disabled={loading || success}
            tabIndex={-1}
          >
            {showPasswords.confirm ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <Button type="submit" disabled={loading || success}>
        {loading ? "Ändern..." : "Passwort ändern"}
      </Button>
    </form>
  );
}
