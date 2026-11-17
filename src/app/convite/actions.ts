"use server";

import { redirect } from "next/navigation";
import { databaseError, formValue } from "@/lib/actions";
import { ensureAccount } from "@/lib/auth/signup";
import type { FormState } from "@/lib/auth/validation";
import { authConfig } from "@/lib/env";
import { INVITATION_TOKEN_PATTERN } from "@/lib/invitations/queries";
import { createClient } from "@/lib/supabase/server";

// Convite de diretor (decisão 19): a conta nasce e já entra na área interna; o convite é a
// aprovação. É o único convite do sistema: o parceiro cria a própria conta em /cadastro (decisão 25).
export async function registerDirector(_previous: FormState, form: FormData): Promise<FormState> {
  const token = formValue(form, "token");
  if (!INVITATION_TOKEN_PATTERN.test(token)) {
    return { error: "Convite inválido." };
  }
  if (!authConfig()) {
    return { error: "O cadastro está temporariamente indisponível." };
  }
  const name = formValue(form, "name").trim();
  const supabase = await createClient();
  // Com "Confirm email" ligado no Supabase, o convite válido confirma o e-mail da conta nova.
  const problem = await ensureAccount(supabase, form, name, async (account) => {
    await supabase.rpc("confirm_invited_signup", { secret: token, account });
  });
  if (problem) {
    return { error: problem };
  }
  const result = await supabase.rpc("register_director", { secret: token, payload: { name } });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  redirect("/inicio");
}
