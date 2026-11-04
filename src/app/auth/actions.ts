"use server";

import type { AuthError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { AUTH_COOKIE, authConfig } from "@/lib/env";
import { authErrorMessage } from "@/lib/auth/errors";
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
      return { error: loginError(error) };
    }
    return { destination: "/" };
  } catch (cause) {
    console.error("Falha no login:", cause);
    return unavailable;
  }
}

// Senha errada é a resposta comum; os outros códigos conhecidos têm texto próprio. O resto (falha de
// conexão ou de configuração) vai para o log do servidor.
function loginError(error: AuthError): string {
  return authErrorMessage(
    error,
    "Não foi possível entrar agora. Tente de novo em instantes; se continuar, avise a Fortes Pay.",
  );
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
