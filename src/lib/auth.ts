import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { env } from "@/lib/env";
import { query } from "@/lib/db";

const serverEnv = env.server();

const providers: NextAuthConfig["providers"] = [];

// Optional: GitHub OAuth (wenn du es behalten willst)
if (serverEnv.GITHUB_CLIENT_ID && serverEnv.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHub({
      clientId: serverEnv.GITHUB_CLIENT_ID,
      clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

// Username + Passwort Login
providers.push(
  Credentials({
    name: "credentials",
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Passwort", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.username || !credentials?.password) {
        return null;
      }

      const username = credentials.username as string;
      const password = credentials.password as string;

      // User aus DB holen
      const users = await query<{ 
        id: string; 
        username: string; 
        hashed_password: string;
        role: string;
        avatar: string | null;
        created_at: string; 
      }>(
        `SELECT id, username, hashed_password, role, avatar, created_at 
         FROM users 
         WHERE username = $1`,
        [username]
      );

      const user = users[0];
      if (!user) {
        return null;
      }

      // Passwort prüfen
      const isValid = await bcrypt.compare(password, user.hashed_password);
      if (!isValid) {
        return null;
      }

      return {
        id: user.id,
        name: user.username,
        email: null, // kein Email-Auth
        role: user.role, // role hinzufügen
        avatar: user.avatar, // avatar hinzufügen
      };
    },
  })
);

export const authConfig: NextAuthConfig = {
  providers,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // Default: 30 Tage (wird durch Cookie überschrieben)
  },
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || 'user';
        token.avatar = (user as any).avatar || null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).avatar = token.avatar;
      }
      return session;
    },
  },
};

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
