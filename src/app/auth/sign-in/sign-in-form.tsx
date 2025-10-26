"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff } from "lucide-react";

export function SignInForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    // Cookie für "Angemeldet bleiben" setzen (30 Tage vs. 1 Tag)
    if (rememberMe) {
      // 30 Tage Session
      document.cookie = `remember-me=true; max-age=${30 * 24 * 60 * 60}; path=/; SameSite=Lax`;
    } else {
      // Cookie löschen/kurze Session
      document.cookie = `remember-me=false; max-age=${24 * 60 * 60}; path=/; SameSite=Lax`;
    }

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Ungültige Anmeldedaten");
        setLoading(false);
      } else {
        // Warte kurz auf Session-Update, dann redirect
        await new Promise(resolve => setTimeout(resolve, 100));
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError("Ein Fehler ist aufgetreten");
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

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input 
          id="username" 
          name="username" 
          type="text" 
          required 
          placeholder="username"
          autoComplete="username"
          disabled={loading}
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <div className="relative">
          <Input 
            id="password" 
            name="password" 
            type={showPassword ? "text" : "password"}
            required 
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={loading}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            disabled={loading}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox 
          id="remember-me"
          checked={rememberMe}
          onCheckedChange={(checked) => setRememberMe(checked === true)}
          disabled={loading}
        />
        <label
          htmlFor="remember-me"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          Angemeldet bleiben
        </label>
      </div>
      
      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Anmelden..." : "Anmelden"}
      </Button>
    </form>
  );
}
