import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { UserManagementClient } from "./user-management-client";

type User = {
  id: string;
  username: string;
  role: string;
  avatar: string | null;
  created_at: string;
};

export default async function UsersPage() {
  const session = await auth();
  
  // Nur Admins dürfen diese Seite sehen
  if (!session?.user || (session.user as any).role !== 'admin') {
    redirect("/");
  }

  // Alle User laden
  const users = await query<User>(
    `SELECT id, username, role, avatar, created_at 
     FROM users 
     ORDER BY created_at DESC`
  );

  return (
    <div className="w-full py-6 px-6">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-2">
            Verwalte alle Benutzer und ihre Rollen
          </p>
        </div>
      </div>

      <UserManagementClient users={users} currentUserId={session.user.id!} />
    </div>
  );
}
