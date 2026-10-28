import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { currentUser } from "@/lib/auth/session";
import { resetPassword } from "./actions";

export const metadata: Metadata = { title: "Nova senha" };

export default async function ResetPasswordPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/esqueci-senha?erro=sessao");
  }
  return (
    <AuthShell title="Definir nova senha" description={`Conta: ${user.email}`}>
      <MutationForm action={resetPassword} label="Salvar nova senha">
        <Field
          label="Nova senha (mínimo de 8 caracteres)"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
        <Field
          label="Confirme a nova senha"
          name="confirmation"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </MutationForm>
    </AuthShell>
  );
}
