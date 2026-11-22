import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountFields } from "@/components/account-fields";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { LogoutButton } from "@/components/session-controls";
import { currentUser, landingPath } from "@/lib/auth/session";
import { registerSeller } from "../actions";

export const metadata: Metadata = { title: "Solicitar conta de vendedor" };

// Pedido de conta do vendedor (decisão 29): ele informa o e-mail da unidade a que pertence e
// aguarda a aprovação de um diretor da Fortes Pay. Depois de aprovado, só vê e registra as
// próprias indicações.
export default async function SellerSignupPage() {
  const user = await currentUser();
  if (user?.profile) {
    redirect(landingPath(user));
  }
  return (
    <AuthShell
      title="Solicitar conta de vendedor"
      description="Para quem vende por uma unidade ou parceiro da Fortes Pay. Informe o seu nome e o e-mail da sua unidade; a Fortes Pay confirma e libera o acesso."
    >
      <MutationForm action={registerSeller} label="Enviar solicitação" pendingLabel="Enviando…">
        <Field label="Seu nome" name="name" required maxLength={120} autoComplete="name" />
        <Field
          label="E-mail da unidade"
          name="unit_email"
          type="email"
          required
          maxLength={254}
          hint="O e-mail com que a sua unidade entra no sistema. Peça a ela se não souber."
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
      <Link
        href="/cadastro"
        className="block text-center text-sm font-medium text-primary hover:underline"
      >
        Sou unidade ou parceiro: criar conta de parceiro
      </Link>
    </AuthShell>
  );
}
