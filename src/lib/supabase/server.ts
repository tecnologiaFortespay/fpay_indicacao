import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE, authConfig } from "@/lib/env";
import type { Database } from "./types";

// Cliente com a sessão do usuário (cookie httpOnly). A RLS e as funções SQL decidem o que ele pode.
export async function createClient() {
  const config = authConfig();
  if (!config) {
    throw new Error("Conexão com o banco não configurada.");
  }
  const store = await cookies();
  return createServerClient<Database>(config.url, config.anonKey, {
    cookieOptions: {
      name: AUTH_COOKIE,
      sameSite: "lax",
      path: "/",
      httpOnly: true,
      secure: config.appUrl.startsWith("https:"),
    },
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(values) {
        try {
          for (const { name, value, options } of values) {
            store.set(name, value, options);
          }
        } catch {
          // Server Components não escrevem cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
