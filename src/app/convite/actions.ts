"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { authErrorMessage } from "@/lib/auth/errors";
import { emailSchema, passwordSchema, type FormState } from "@/lib/auth/validation";
import { authConfig } from "@/lib/env";
import { INVITATION_TOKEN_PATTERN } from "@/lib/invitations/queries";
import { createClient } from "@/lib/supabase/server";

const accountSchema = z.object({ email: emailSchema, password: passwordSchema });

// Quem abre o link cria a conta e o cadastro de uma vez. O cadastro fica pendente até o diretor aprovar.
export async function registerPartner(_previous: FormState, form: FormData): Promise<FormState> {
  const token = formValue(form, "token");
  if (!INVITATION_TOKEN_PATTERN.test(token)) {
    return { error: "Convite inválido." };
  }
  if (!authConfig()) {
    return { error: "O cadastro está temporariamente indisponível." };
  }
  const payload = {
    name: formValue(form, "name"),
    city: formValue(form, "city"),
    state: formValue(form, "state"),
    contact_name: formValue(form, "contact_name"),
    contact_phone: formValue(form, "contact_phone"),
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const account = accountSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!account.success) {
      return { error: account.error.issues[0].message };
    }
    const signUp = await supabase.auth.signUp({
      email: account.data.email,
      password: account.data.password,
      options: { data: { display_name: payload.contact_name } },
    });
    const existing = signUp.error && /already|registered|exists/i.test(signUp.error.message);
    if (signUp.error && !existing) {
      return {
        error: authErrorMessage(
          signUp.error,
          "Não foi possível criar a conta agora. Confira o e-mail e a senha e tente de novo.",
        ),
      };
    }
    if (!signUp.data.session) {
      // Com "Confirm email" ligado no Supabase a conta nasce sem sessão: o convite válido confirma o
      // e-mail, porque é ele que comprova a origem. Conta que já existia sem cadastro concluído
      // (ex.: criada antes desta regra) entra com a própria senha e segue.
      const created = signUp.data.user;
      if (created?.identities?.length) {
        await supabase.rpc("confirm_invited_signup", { secret: token, account: created.id });
      }
      const signIn = await supabase.auth.signInWithPassword(account.data);
      if (signIn.error) {
        return {
          error: "Este e-mail já tem conta. Entre com ela e abra o link do convite de novo.",
        };
      }
    }
  }
  const result = await supabase.rpc("register_partner", { secret: token, payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  // Redireciona no servidor: a nova renderização da página do convite já o mostraria como utilizado.
  redirect("/cadastro-em-analise");
}
