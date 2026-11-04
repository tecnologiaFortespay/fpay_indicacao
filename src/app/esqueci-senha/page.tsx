import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { Notice } from "@/components/notice";
import { requestRecovery } from "./actions";

export const metadata: Metadata = { title: "Esqueci minha senha" };

type PageProps = { searchParams: Promise<{ erro?: string }> };

export default async function RecoveryPage({ searchParams }: PageProps) {
  const { erro } = await searchParams;
  return (
    <AuthShell
      title="Esqueci minha senha"
      description="Informe o e-mail da sua conta para receber o link de redefinição."
    >
      {erro === "sessao" && (
        <Notice tone="warning" role="status" compact>
          O link de nova senha expirou ou já foi usado. Peça um novo abaixo ou à Fortes Pay.
        </Notice>
      )}
      <MutationForm action={requestRecovery} label="Enviar link" pendingLabel="Enviando…">
        <Field
          label="E-mail"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </MutationForm>
      <p className="text-sm text-muted-foreground">
        Se o e-mail não chegar em alguns minutos, peça à Fortes Pay um link de nova senha.
      </p>
      <Link href="/login" className="text-sm text-primary underline">
        Voltar ao login
      </Link>
    </AuthShell>
  );
}
