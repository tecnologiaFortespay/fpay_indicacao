"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { passwordResetMessage } from "@/lib/auth/password-reset-mail";
import { emailSchema, type FormState } from "@/lib/auth/validation";
import { mailLinkOrigin } from "@/lib/env";
import { mailSettings, sendMail } from "@/lib/mail";
import { serviceClient } from "@/lib/supabase/admin";

const accountSchema = z.object({ display_name: z.string(), email: z.string() });

// A resposta é a mesma com ou sem cadastro: a tela não confirma quais e-mails têm conta.
const SENT =
  "Se este e-mail tiver cadastro, o link para criar a nova senha foi enviado. Ele vale por 24 horas. Confira também a caixa de spam.";
const UNAVAILABLE =
  "O envio de e-mail não está disponível agora. Peça o link de nova senha à Fortes Pay.";
const FAILED =
  "Não foi possível enviar o e-mail agora. Tente de novo em instantes; se continuar, peça o link de nova senha à Fortes Pay.";

// "Esqueci minha senha" (decisão 26): gera o link de nova senha (24 horas, uso único, só o hash no
// banco) e o envia para o e-mail informado, pela caixa de suporte. O link abre /nova-senha/[token],
// a mesma tela do link gerado pelo diretor.
export async function requestPasswordReset(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) {
    return { error: "Informe um e-mail válido." };
  }
  const admin = serviceClient();
  if (!admin || !mailSettings()) {
    return { error: UNAVAILABLE };
  }
  const secret = randomBytes(32).toString("base64url");
  const result = await admin.rpc("request_password_reset", { account_email: email.data, secret });
  if (result.error) {
    console.error("Pedido de nova senha recusado pelo banco:", result.error.message);
    return { error: FAILED };
  }
  // Sem dados: e-mail sem cadastro, ou outro pedido para a mesma conta há menos de 2 minutos.
  const account = accountSchema.safeParse(result.data);
  if (!account.success) {
    return { success: SENT };
  }
  const link = `${mailLinkOrigin(await headers())}/nova-senha/${secret}`;
  try {
    await sendMail(passwordResetMessage({ ...account.data, link }));
  } catch (cause) {
    console.error("Falha ao enviar o e-mail de nova senha:", cause);
    // Desfaz o link que não chegou a ninguém, para a pessoa poder pedir de novo na hora.
    await admin.rpc("cancel_password_reset", { secret });
    return { error: FAILED };
  }
  return { success: SENT };
}
