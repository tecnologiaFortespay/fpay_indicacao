"use server";

import { cookies } from "next/headers";
import { AUTH_COOKIE, authConfig } from "@/lib/env";
import { loginSchema, type FormState } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

const unavailable: FormState = {
  error: "O acesso está temporariamente indisponível. Tente novamente mais tarde.",
};

export async function login(_previous: FormState, form: FormData): Promise<FormState> {
  const input = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!input.success) {
    return { error: input.error.issues[0].message };
  }
  if (!authConfig()) {
    return unavailable;
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(input.data);
    if (error) {
      return { error: "E-mail ou senha incorretos." };
    }
    return { destination: "/" };
  } catch {
    return unavailable;
  }
}

export async function logout(): Promise<FormState> {
  try {
    if (authConfig()) {
      const supabase = await createClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        return { error: "Não foi possível encerrar a sessão. Tente novamente." };
      }
    }
  } catch {
    return { error: "Não foi possível encerrar a sessão. Tente novamente." };
  }
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith(AUTH_COOKIE)) {
      store.delete(cookie.name);
    }
  }
  return { destination: "/login" };
}
