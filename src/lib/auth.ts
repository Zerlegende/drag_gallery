import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import EmailProvider from "next-auth/providers/email";

import { env } from "@/lib/env";

const serverEnv = env.server();

const providers: NextAuthConfig["providers"] = [];

if (serverEnv.GITHUB_CLIENT_ID && serverEnv.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHub({
      clientId: serverEnv.GITHUB_CLIENT_ID,
      clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

providers.push(
  EmailProvider({
    server: {
      host: serverEnv.EMAIL_SERVER_HOST ?? "localhost",
      port: serverEnv.EMAIL_SERVER_PORT ?? 1025,
      auth:
        serverEnv.EMAIL_SERVER_USER && serverEnv.EMAIL_SERVER_PASSWORD
          ? {
              user: serverEnv.EMAIL_SERVER_USER,
              pass: serverEnv.EMAIL_SERVER_PASSWORD,
            }
          : undefined,
    },
    from: serverEnv.EMAIL_FROM ?? "bz-bilder@example.com",
  }),
);

export const authConfig: NextAuthConfig = {
  providers,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/sign-in",
  },
};

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
