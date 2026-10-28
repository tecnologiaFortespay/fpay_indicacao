import { z } from "zod";

const schema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
  appUrl: z.url(),
});

export type AuthConfig = {
  url: string;
  anonKey: string;
  appUrl: string;
};

// Null when the environment is not configured; pages then show an "unavailable" message.
export function authConfig(): AuthConfig | null {
  const parsed = schema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    return null;
  }
  const origin = new URL(parsed.data.appUrl);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    return null;
  }
  return { ...parsed.data, appUrl: origin.origin };
}

export function environmentLabel(): string {
  return process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL?.trim() ?? "";
}

export const AUTH_COOKIE = "fp-indicacao-auth";
