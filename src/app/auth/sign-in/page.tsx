import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function SignInPage() {
  const session = await auth();

  async function handleSignIn(provider: string) {
    "use server";
    await signIn(provider);
  }

  if (session?.user) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center space-y-6">
        <h1 className="text-2xl font-semibold">Du bist bereits angemeldet</h1>
        <p className="text-muted-foreground">Wechsle zurück zur Galerie, um deine Bilder zu verwalten.</p>
      </div>
    );
  }

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Anmelden</h1>
        <p className="text-muted-foreground">Melde dich an, um Bilder hochzuladen und deine Galerie zu organisieren.</p>
      </div>
      <form action={handleSignIn.bind(null, "github")}>
        <Button type="submit" size="lg">
          Mit GitHub anmelden
        </Button>
      </form>
      <form action={handleSignIn.bind(null, "email")} className="text-sm text-muted-foreground">
        <Button type="submit" variant="outline">
          Magic-Link per E-Mail senden
        </Button>
        <p className="mt-2 max-w-md text-center text-xs text-muted-foreground">
          E-Mail-Anmeldung setzt einen konfigurierten SMTP-Server voraus. Hinterlege deine Zugangsdaten in der Umgebungskonfiguration.
        </p>
      </form>
    </div>
  );
}
