import { Wrench, ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isMaintenanceMode } from "@/lib/maintenance";
import Link from "next/link";

export default async function MaintenancePage() {
  const session = await auth();
  const maintenanceActive = await isMaintenanceMode();

  // Wenn Wartungsmodus nicht aktiv ist, zur Startseite
  if (!maintenanceActive) {
    redirect("/");
  }

  // Admins zur Startseite umleiten (sie dürfen trotz Wartungsmodus rein)
  const isAdmin = session?.user && (session.user as any).role === "admin";
  if (isAdmin) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8 flex justify-center">
          <div className="rounded-full bg-orange-100 dark:bg-orange-900/20 p-6">
            <Wrench className="h-16 w-16 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          Wartungsarbeiten
        </h1>

        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Wir führen gerade Wartungsarbeiten durch, um unseren Service für dich zu verbessern. 
          Bitte versuche es in wenigen Minuten erneut.
        </p>

        <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Normalerweise sollten diese Arbeiten nicht lange dauern. Falls du dringend Zugriff benötigst, 
            kontaktiere bitte den Administrator.
          </p>
        </div>

        {session?.user && (
          <Link
            href="/api/auth/signout"
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Ausloggen
          </Link>
        )}
      </div>
    </div>
  );
}
