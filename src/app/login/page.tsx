import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { Notice } from "@/components/notice";
import { currentUser, landingPath } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/competency";
import { builtAt, configurationProblems } from "@/lib/env";

export const metadata: Metadata = { title: "Entrar" };

type PageProps = { searchParams: Promise<{ senha?: string; erro?: string; motivo?: string }> };

export default async function LoginPage({ searchParams }: PageProps) {
  const user = await currentUser();
  if (user) {
    redirect(landingPath(user));
  }
  const params = await searchParams;
  const problems = configurationProblems();
  const configured = problems.length === 0;
  const built = builtAt();
  return (
    <AuthShell
      title="Bem-vindo ao Fortes Pay"
      description="Entre para acessar seu espaço no programa de indicação."
    >
      {!configured && (
        <Notice tone="warning" role="status">
          O ambiente está em configuração. O login será liberado assim que a conexão estiver
          disponível.
          <small>
            Para a equipe técnica: confira no servidor{" "}
            {problems.map((problem) => `${problem.variable} (${problem.issue})`).join(", ")}.
          </small>
        </Notice>
      )}
      {params.senha === "alterada" && (
        <Notice tone="success" role="status" compact>
          Senha alterada. Entre com a nova senha.
        </Notice>
      )}
      {params.erro === "link" && (
        <Notice tone="danger" role="status" compact>
          Este link é inválido ou expirou. Peça um novo link à Fortes Pay.
        </Notice>
      )}
      {params.motivo === "sessao" && (
        <Notice tone="warning" role="status" compact>
          Sua sessão expirou. Entre de novo para continuar.
        </Notice>
      )}
      <LoginForm disabled={!configured} />
      <Link
        href="/esqueci-senha"
        className="block text-center text-sm font-medium text-primary hover:underline"
      >
        Esqueci minha senha
      </Link>
      {built && (
        <p className="text-center text-xs text-muted-foreground">
          Versão de {formatDateTime(built)}
        </p>
      )}
    </AuthShell>
  );
}
