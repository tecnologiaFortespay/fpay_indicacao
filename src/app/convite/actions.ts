"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
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
    if (signUp.error) {
      if (/already|registered|exists/i.test(signUp.error.message)) {
        return {
          error: "Este e-mail já tem conta. Entre com ela e abra o link do convite de novo.",
        };
      }
      return { error: "Não foi possível criar a conta. Confira o e-mail e a senha." };
    }
    if (!signUp.data.session) {
      return {
        success:
          "Conta criada. Confirme o e-mail que acabamos de enviar e abra o link do convite de novo para concluir o cadastro.",
      };
    }
  }
  const result = await supabase.rpc("register_partner", { secret: token, payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  // Redireciona no servidor: a nova renderização da página do convite já o mostraria como utilizado.
  redirect("/cadastro-em-analise");
}
