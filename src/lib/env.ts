import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  MINIO_ENDPOINT: z.string().url(),
  MINIO_PUBLIC_ENDPOINT: z.string().url().optional(),
  MINIO_BUCKET: z.string(),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_REGION: z.string().default("us-east-1"),
  MINIO_USE_SSL: z.enum(["true", "false"]).default("false"),
  NEXTAUTH_SECRET: z.string().min(16),
  NEXTAUTH_URL: z.string().url().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string(),
  NEXT_PUBLIC_MINIO_BUCKET: z.string(),
  NEXT_PUBLIC_MINIO_BASE_URL: z.string().url().optional(),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

declare global {
  // eslint-disable-next-line no-var
  var __env: ServerEnv | undefined;
}

function getServerEnv(): ServerEnv {
  if (globalThis.__env) {
    return globalThis.__env;
  }

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "❌ Invalid server environment variables",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid server environment variables");
  }

  globalThis.__env = parsed.data;
  return parsed.data;
}

export const env = {
  server: getServerEnv,
  client: clientEnvSchema.parse({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "Drag Gallery",
    NEXT_PUBLIC_MINIO_BUCKET:
      process.env.NEXT_PUBLIC_MINIO_BUCKET ?? "bz-bilder",
    NEXT_PUBLIC_MINIO_BASE_URL: process.env.NEXT_PUBLIC_MINIO_BASE_URL,
  }),
};
