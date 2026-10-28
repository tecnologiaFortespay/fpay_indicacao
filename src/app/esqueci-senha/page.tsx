import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { requestRecovery } from "./actions";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function RecoveryPage() {
  return (
    <AuthShell
      title="Esqueci minha senha"
      description="Informe o e-mail da sua conta para receber o link de redefinição."
    >
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
      <Link href="/login" className="text-sm text-primary underline">
        Voltar ao login
      </Link>
    </AuthShell>
  );
}
