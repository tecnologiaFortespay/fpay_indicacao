import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LogoutButton, SessionGuard } from "@/components/session-controls";
import { currentUser, hasAccess, landingPath } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sem acesso" };

export default async function NoAccessPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.profile) {
    redirect(landingPath(user));
  }
  const allowed = hasAccess(user);
  if (allowed) {
    redirect("/inicio");
  }
  return (
    <AuthShell
      title="Cadastro não concluído"
      description="Esta conta existe, mas o cadastro não foi concluído. Parceiro ou vendedor: conclua o cadastro abaixo. Diretor: abra de novo o link do convite que recebeu, com esta conta já conectada."
    >
      <SessionGuard />
      <p className="break-all text-sm text-muted-foreground">{user.email}</p>
      <Link href="/cadastro" className="block text-sm font-medium text-primary hover:underline">
        Concluir cadastro de parceiro
      </Link>
      <Link
        href="/cadastro/vendedor"
        className="block text-sm font-medium text-primary hover:underline"
      >
        Concluir solicitação de conta de vendedor
      </Link>
      <LogoutButton />
    </AuthShell>
  );
}
