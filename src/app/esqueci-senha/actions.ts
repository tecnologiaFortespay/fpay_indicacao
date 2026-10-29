"use server";

import { headers } from "next/headers";
import { emailSchema, type FormState } from "@/lib/auth/validation";
import { appOrigin, authConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const RECOVERY_MESSAGE =
  "Se houver uma conta para este e-mail, você receberá um link para definir a nova senha.";

export async function requestRecovery(_previous: FormState, form: FormData): Promise<FormState> {
  const input = emailSchema.safeParse(form.get("email"));
  if (!input.success) {
    return { error: input.error.issues[0].message };
  }
  if (!authConfig()) {
    return { error: "A recuperação de senha está temporariamente indisponível." };
  }
  try {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(input.data, {
      redirectTo: `${appOrigin(await headers())}/auth/callback?next=/redefinir-senha`,
    });
  } catch {
    // Mesma resposta para conta inexistente ou falha do provedor: não revela quem tem conta.
  }
  return { success: RECOVERY_MESSAGE };
}
