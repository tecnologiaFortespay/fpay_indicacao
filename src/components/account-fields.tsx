import type { SessionUser } from "@/lib/auth/session";
import { Field } from "./fields";

// E-mail, senha e confirmação da senha da conta nova (Criar conta e convite de diretor), um campo
// por linha; quem já está conectado, sem cadastro, só vê a conta que vai usar.
export function AccountFields({ user }: { user: SessionUser | null }) {
  if (user) {
    return <p className="text-sm text-muted-foreground">Conta: {user.email}</p>;
  }
  return (
    <>
      <Field
        label="E-mail de acesso"
        name="email"
        type="email"
        required
        maxLength={254}
        autoComplete="email"
        hint="É com ele que você entra, e é para ele que vai o link se esquecer a senha."
      />
      <Field
        label="Senha (mínimo de 8 caracteres)"
        name="password"
        type="password"
        required
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
      />
      <Field
        label="Confirmar senha"
        name="confirmation"
        type="password"
        required
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
        hint="Digite a mesma senha de novo, para evitar erro de digitação."
      />
    </>
  );
}
