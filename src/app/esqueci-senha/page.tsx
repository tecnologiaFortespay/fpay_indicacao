import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { Notice } from "@/components/notice";
import { mailSettings } from "@/lib/mail";
import { serviceClient } from "@/lib/supabase/admin";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Esqueci minha senha" };

type PageProps = { searchParams: Promise<{ erro?: string }> };

function ExpiredNotice({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return (
    <Notice tone="warning" role="status" compact>
      O link de nova senha expirou ou já foi usado. Peça um novo.
    </Notice>
  );
}

function BackToLogin() {
  return (
    <Link href="/login" className="text-sm text-primary underline">
      Voltar ao login
    </Link>
  );
}

// Decisão 26: a pessoa informa o e-mail e recebe o link de nova senha, enviado pela caixa de
// suporte da Fortes Pay. Enquanto o envio não estiver configurado no servidor (variáveis SMTP_* e
// SUPABASE_SERVICE_ROLE_KEY), a página explica o caminho pelo diretor, sem prometer e-mail.
export default async function RecoveryPage({ searchParams }: PageProps) {
  const { erro } = await searchParams;
  const byEmail = serviceClient() !== null && mailSettings() !== null;
  if (!byEmail) {
    return (
      <AuthShell
        title="Esqueci minha senha"
        description="A nova senha sai por um link gerado por um diretor da Fortes Pay. O envio por e-mail ainda não está ligado neste ambiente."
      >
        <ExpiredNotice show={erro === "sessao"} />
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>Parceiro:</strong> peça à Fortes Pay. O diretor gera o link na sua ficha e envia
            a você por WhatsApp ou e-mail.
          </li>
          <li>
            <strong>Diretor:</strong> peça a outro diretor. Ele gera o link em Equipe.
          </li>
          <li>
            O link vale por 24 horas e uma única vez. Ao abrir, você define a senha nova e entra.
          </li>
        </ul>
        <BackToLogin />
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Esqueci minha senha"
      description="Informe o e-mail do seu acesso. Enviamos um link para você criar uma senha nova."
    >
      <ExpiredNotice show={erro === "sessao"} />
      <MutationForm action={requestPasswordReset} label="Enviar link" pendingLabel="Enviando…">
        <Field
          label="E-mail"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </MutationForm>
      <p className="fp-help">
        O link vale por 24 horas e uma única vez. Não chegou em alguns minutos? Confira a caixa de
        spam ou peça à Fortes Pay: um diretor também pode gerar o link para você.
      </p>
      <BackToLogin />
    </AuthShell>
  );
}
