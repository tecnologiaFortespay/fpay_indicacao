import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { databaseError } from "@/lib/actions";
import type { FormState } from "@/lib/auth/validation";
import { appOrigin } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Link de nova senha (24 horas, uso único) para a conta indicada, gerado por um diretor na ficha
// do parceiro ou na Equipe. Só o hash fica no banco; o diretor copia o link e envia.
export async function passwordResetLink(
  targetUserId: string,
  recipient: string,
): Promise<FormState> {
  const secret = randomBytes(32).toString("base64url");
  const supabase = await createClient();
  const result = await supabase.rpc("create_password_reset", { target: targetUserId, secret });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  return {
    success: `Link gerado. Copie e envie ao ${recipient}: vale por 24 horas e uma única vez.`,
    link: `${appOrigin(await headers())}/nova-senha/${secret}`,
  };
}
