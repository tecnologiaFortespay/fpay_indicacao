"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { passwordResetLink } from "@/lib/auth/password-reset-link";
import { actionUser, deniedState } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import { appOrigin } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Convite de diretor: o mesmo link do convite de parceiro, com o tipo "director". Quem abre cria o
// próprio acesso e entra direto (decisão 19).
export async function createDirectorInvitation(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const validUntil = formValue(form, "valid_until");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return { error: "Informe a validade do convite." };
  }
  const secret = randomBytes(32).toString("base64url");
  const payload = {
    partner_name: formValue(form, "name"),
    kind: "director",
    // Fim do dia em Fortaleza (UTC-3, sem horário de verão), como o diretor lê no formulário.
    valid_until: `${validUntil}T23:59:59-03:00`,
    secret,
  };
  const supabase = await createClient();
  const result = await supabase.rpc("create_invitation", { payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePath("/equipe");
  return {
    success: "Convite criado. Copie o link abaixo e envie à pessoa.",
    link: `${appOrigin(await headers())}/convite/${secret}`,
  };
}

// Link de nova senha para outro diretor. A própria senha se troca em Minha conta.
export async function createDirectorPasswordReset(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const target = formValue(form, "user_id");
  if (!z.uuid().safeParse(target).success) {
    return { error: "Diretor inválido." };
  }
  if (target === user.userId) {
    return { error: "Para trocar a sua própria senha, use Minha conta." };
  }
  return passwordResetLink(target, "diretor");
}
