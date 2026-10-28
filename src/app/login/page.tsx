import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { currentUser, landingPath } from "@/lib/auth/session";
import { authConfig } from "@/lib/env";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) {
    redirect(landingPath(user));
  }
  const configured = Boolean(authConfig());
  return (
    <AuthShell
      title="Bem-vindo ao Fortes Pay"
      description="Entre para acessar seu espaço no programa de indicação."
    >
      {!configured && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          O ambiente está em configuração. O login será liberado assim que a conexão estiver
          disponível.
        </p>
      )}
      <LoginForm disabled={!configured} />
    </AuthShell>
  );
}
