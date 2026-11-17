import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountFields } from "@/components/account-fields";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { LogoutButton } from "@/components/session-controls";
import { currentUser, landingPath } from "@/lib/auth/session";
import { registerPartner } from "./actions";

export const metadata: Metadata = { title: "Criar conta" };

// Cadastro aberto do parceiro (decisão 25): não há convite. Quem indica clientes cria a própria
// conta aqui e aguarda a confirmação de um diretor da Fortes Pay.
export default async function SignupPage() {
  const user = await currentUser();
  if (user?.profile) {
    redirect(landingPath(user));
  }
  return (
    <AuthShell
      title="Criar conta de parceiro"
      description="Para unidades e parceiros que indicam clientes à Fortes Pay. Preencha seus dados; a Fortes Pay confirma o cadastro e libera o acesso."
    >
      <MutationForm action={registerPartner} label="Enviar cadastro" pendingLabel="Enviando…">
        <Field
          label="Nome da unidade ou do parceiro"
          name="name"
          required
          maxLength={160}
          hint="Como a Fortes Pay conhece você: o nome da unidade, da empresa ou o seu."
        />
        <div className="fp-form-grid">
          <Field label="Cidade" name="city" required maxLength={120} />
          <Field label="UF" name="state" required minLength={2} maxLength={2} placeholder="CE" />
        </div>
        <Field
          label="Nome do responsável"
          name="contact_name"
          required
          maxLength={120}
          autoComplete="name"
        />
        <Field
          label="Telefone"
          name="contact_phone"
          type="tel"
          required
          maxLength={40}
          autoComplete="tel"
        />
        <AccountFields user={user} />
      </MutationForm>
      {user ? (
        <LogoutButton />
      ) : (
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-primary hover:underline"
        >
          Já tenho conta: entrar
        </Link>
      )}
    </AuthShell>
  );
}
