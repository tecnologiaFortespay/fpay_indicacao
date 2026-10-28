import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { currentUser, landingPath } from "@/lib/auth/session";
import { authConfig } from "@/lib/env";

export const metadata: Metadata = { title: "Entrar" };

type PageProps = { searchParams: Promise<{ senha?: string; erro?: string }> };

export default async function LoginPage({ searchParams }: PageProps) {
  const user = await currentUser();
  if (user) {
    redirect(landingPath(user));
  }
  const params = await searchParams;
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
      {params.senha === "alterada" && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Senha alterada. Entre com a nova senha.
        </p>
      )}
      {params.erro === "link" && (
        <p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Este link é inválido ou expirou. Solicite uma nova recuperação de senha.
        </p>
      )}
      <LoginForm disabled={!configured} />
      <Link
        href="/esqueci-senha"
        className="block text-center text-sm font-medium text-primary hover:underline"
      >
        Esqueci minha senha
      </Link>
    </AuthShell>
  );
}
