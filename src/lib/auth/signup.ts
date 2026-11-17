import "server-only";
import { z } from "zod";
import { authErrorMessage } from "@/lib/auth/errors";
import { emailSchema, passwordSchema } from "@/lib/auth/validation";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const accountSchema = z.object({ email: emailSchema, password: passwordSchema });

// Garante uma conta conectada para concluir um cadastro (de parceiro, em Criar conta, ou de diretor,
// pelo convite): quem já está conectado (sem cadastro) segue com a conta dele; quem não está cria a
// conta com e-mail, senha e confirmação da senha. Devolve a mensagem de erro, se houver.
//
// confirmEmail só existe no convite de diretor: com "Confirm email" ligado no Supabase a conta
// nasce sem sessão, e o convite válido confirma o e-mail (é ele que comprova a origem).
export async function ensureAccount(
  supabase: Client,
  form: FormData,
  displayName: string,
  confirmEmail?: (accountId: string) => Promise<unknown>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return null;
  }
  const account = accountSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!account.success) {
    return account.error.issues[0].message;
  }
  if (form.get("confirmation") !== account.data.password) {
    return "As senhas precisam ser iguais.";
  }
  const signUp = await supabase.auth.signUp({
    email: account.data.email,
    password: account.data.password,
    options: { data: { display_name: displayName } },
  });
  const existing = signUp.error && /already|registered|exists/i.test(signUp.error.message);
  if (signUp.error && !existing) {
    return authErrorMessage(
      signUp.error,
      "Não foi possível criar a conta agora. Confira o e-mail e a senha e tente de novo.",
    );
  }
  if (signUp.data.session) {
    return null;
  }
  // Sem sessão: a conta já existia (entra com a senha informada e segue, se ainda não tem cadastro)
  // ou acabou de nascer esperando a confirmação do e-mail.
  const created = signUp.data.user?.identities?.length ? signUp.data.user : null;
  if (created && confirmEmail) {
    await confirmEmail(created.id);
  }
  const signIn = await supabase.auth.signInWithPassword(account.data);
  if (!signIn.error) {
    return null;
  }
  if (created) {
    return "Conta criada. Confirme o e-mail pelo link que enviamos e depois entre para concluir o cadastro.";
  }
  return "Este e-mail já tem conta. Entre com ela para continuar; se esqueceu a senha, use “Esqueci minha senha”.";
}
