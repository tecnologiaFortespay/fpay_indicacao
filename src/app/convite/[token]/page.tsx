import type { Metadata } from "next";
import Link from "next/link";

import { AccountFields } from "@/components/account-fields";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { Notice } from "@/components/notice";
import { LogoutButton } from "@/components/session-controls";
import { currentUser, landingPath } from "@/lib/auth/session";
import { formatDate } from "@/lib/competency";
import { invitationPreview } from "@/lib/invitations/queries";
import { registerDirector } from "../actions";

export const metadata: Metadata = { title: "Convite" };

type PageProps = { params: Promise<{ token: string }> };

// Convite de diretor (Equipe, decisão 19). Convite de parceiro não existe mais (decisão 25): quem
// abre um link antigo é levado ao cadastro aberto.
export default async function InvitationPage({ params }: PageProps) {
  const { token } = await params;
  const preview = await invitationPreview(token);
  if (!preview) {
    return (
      <AuthShell
        title="Convite inválido"
        description="Este link não corresponde a um convite da Fortes Pay."
      >
        <p className="text-sm">Abra o link exatamente como foi recebido ou peça um novo convite.</p>
        <Link href="/login" className="text-primary underline">
          Entrar
        </Link>
      </AuthShell>
    );
  }
  if (preview.status === "used") {
    return (
      <AuthShell title="Convite já utilizado" description="O cadastro deste convite já foi feito.">
        <p className="text-sm">
          Se foi você, entre com sua conta. Se não, peça um novo convite à Fortes Pay.
        </p>
        <Link href="/login" className="text-primary underline">
          Entrar
        </Link>
      </AuthShell>
    );
  }
  if (preview.kind !== "director") {
    return (
      <AuthShell
        title="O cadastro agora é direto"
        description="O parceiro não precisa mais de convite: cria a própria conta no site e a Fortes Pay confirma o cadastro."
      >
        <Link href="/cadastro" className="text-primary underline">
          Criar conta de parceiro
        </Link>
        <Link href="/login" className="text-primary underline">
          Já tenho conta: entrar
        </Link>
      </AuthShell>
    );
  }
  if (preview.status === "expired") {
    return (
      <AuthShell
        title="Convite expirado"
        description={`Este convite valia até ${formatDate(preview.expires_at)}.`}
      >
        <p className="text-sm">Peça um novo link à Fortes Pay.</p>
      </AuthShell>
    );
  }
  const user = await currentUser();
  if (user?.profile) {
    // Conectado com outra conta (ex.: um parceiro abrindo o convite de um diretor): explica em vez
    // de redirecionar em silêncio.
    return (
      <AuthShell
        title="Você já está conectado"
        description={`Este convite é para ${preview.partner_name}, mas este navegador está conectado como ${user.email}.`}
      >
        <Notice tone="warning" compact>
          Para usar este convite, saia e abra o link de novo. Se o convite for para você mesmo,
          entre com a sua conta.
        </Notice>
        <LogoutButton />
        <Link href={landingPath(user)} className="text-primary underline">
          Voltar para o meu painel
        </Link>
      </AuthShell>
    );
  }
  // Só nome, e-mail e senha; entra direto na área interna.
  return (
    <AuthShell
      title={`Cadastro · ${preview.partner_name}`}
      description={`Convite para diretor, válido até ${formatDate(preview.expires_at)}. Crie seu acesso: você entra direto na área interna da Fortes Pay.`}
    >
      <MutationForm action={registerDirector} label="Criar acesso" pendingLabel="Criando…">
        <input type="hidden" name="token" value={token} />
        <Field
          label="Seu nome"
          name="name"
          required
          maxLength={120}
          defaultValue={preview.partner_name}
          autoComplete="name"
        />
        <AccountFields user={user} />
      </MutationForm>
    </AuthShell>
  );
}
