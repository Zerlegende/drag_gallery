import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center space-y-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Anmelden</h1>
          <p className="text-muted-foreground">Melde dich mit deinem Account an</p>
        </div>
        
        <SignInForm />
      </div>
    </div>
  );
}
