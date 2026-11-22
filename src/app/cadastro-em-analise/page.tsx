import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/notice";
import { LogoutButton, SessionGuard } from "@/components/session-controls";
import { currentUser, hasAccess, landingPath, type Profile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Cadastro em análise" };

// Vendedor sem acesso (decisão 29): pedido aguardando o diretor, recusado ou com o acesso removido.
function SellerWaiting({ profile, email }: { profile: Profile; email: string }) {
  const pending = profile.status === "pending";
  return (
    <AuthShell
      title={pending ? "Solicitação em análise" : "Acesso não liberado"}
      description={
        pending
          ? "Sua solicitação de conta de vendedor foi recebida. O acesso é liberado assim que a Fortes Pay aprovar."
          : "A Fortes Pay não liberou ou encerrou o seu acesso de vendedor. Se precisar de esclarecimentos, fale com a sua unidade."
      }
    >
      <SessionGuard />
      <p className="text-sm">
        <strong>{profile.display_name}</strong>
      </p>
      {profile.partner && <p className="text-sm">Unidade: {profile.partner.name}</p>}
      <p className="break-all text-sm text-muted-foreground">{email}</p>
      {pending && (
        <Notice tone="info" compact>
          Quando a Fortes Pay aprovar, basta entrar de novo com o seu e-mail e senha para ver as
          suas indicações.
        </Notice>
      )}
      <LogoutButton />
    </AuthShell>
  );
}

export default async function PendingRegistrationPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.profile || hasAccess(user)) {
    redirect(landingPath(user));
  }
  if (user.profile.role === "seller") {
    return <SellerWaiting profile={user.profile} email={user.email} />;
  }
  const partner = user.profile.partner;
  const rejected = partner?.status === "rejected";
  const title = rejected ? "Cadastro não aprovado" : "Cadastro em análise";
  const description = rejected
    ? "A Fortes Pay não aprovou este cadastro. Se precisar de esclarecimentos, fale com a equipe."
    : "Seu cadastro foi recebido. O acesso é liberado assim que a Fortes Pay aprovar.";
  return (
    <AuthShell title={title} description={description}>
      <SessionGuard />
      <p className="text-sm">
        <strong>{partner?.name}</strong>
      </p>
      <p className="break-all text-sm text-muted-foreground">{user.email}</p>
      {rejected && partner?.rejection_reason && (
        <Notice tone="danger" compact>
          Motivo: {partner.rejection_reason}
        </Notice>
      )}
      {!rejected && (
        <Notice tone="info" compact>
          Quando a Fortes Pay aprovar, basta entrar de novo com o seu e-mail e senha para ver o seu
          painel.
        </Notice>
      )}
      <LogoutButton />
    </AuthShell>
  );
}
