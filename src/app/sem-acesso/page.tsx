import type { Metadata } from "next";
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
      title="Conta sem perfil"
      description="Esta conta existe, mas ainda não tem um perfil nesta plataforma. Fale com a Fortes Pay."
    >
      <SessionGuard />
      <p className="break-all text-sm text-muted-foreground">{user.email}</p>
      <LogoutButton />
    </AuthShell>
  );
}
