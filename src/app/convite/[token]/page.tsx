import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Field, SelectField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { currentUser, landingPath } from "@/lib/auth/session";
import { formatDate } from "@/lib/competency";
import { invitationPreview } from "@/lib/invitations/queries";
import { partnerKindLabels, paymentMethodLabels } from "@/lib/labels";
import { registerPartner } from "../actions";

export const metadata: Metadata = { title: "Convite" };

type PageProps = { params: Promise<{ token: string }> };

const paymentOptions: [string, string][] = [
  ["", "Informar depois"],
  ...(Object.entries(paymentMethodLabels) as [string, string][]),
];

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
    redirect(landingPath(user));
  }
  const kind = partnerKindLabels[preview.kind];
  return (
    <AuthShell
      title={`Cadastro · ${preview.partner_name}`}
      description={`Convite para ${kind.toLocaleLowerCase("pt-BR")}, válido até ${formatDate(preview.expires_at)}. Preencha seus dados; a Fortes Pay aprova e libera o acesso.`}
    >
      <MutationForm action={registerPartner} label="Enviar cadastro" pendingLabel="Enviando…">
        <input type="hidden" name="token" value={token} />
        <Field
          label="Nome da unidade ou do indicador"
          name="name"
          required
          maxLength={160}
          defaultValue={preview.partner_name}
        />
        <div className="fp-form-grid">
          <Field label="Cidade" name="city" maxLength={120} />
          <Field label="UF" name="state" maxLength={2} placeholder="CE" />
        </div>
        <Field
          label="Nome do responsável"
          name="contact_name"
          required
          maxLength={160}
          autoComplete="name"
        />
        <Field label="Telefone" name="contact_phone" type="tel" maxLength={40} autoComplete="tel" />
        {user ? (
          <p className="text-sm text-muted-foreground">Conta: {user.email}</p>
        ) : (
          <div className="fp-form-grid">
            <Field
              label="E-mail de acesso"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
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
          </div>
        )}
        <SelectField
          label="Meio de pagamento"
          name="payment_method"
          options={paymentOptions}
          hint="Como você prefere receber. Pode deixar para informar na aprovação."
        />
        <Field label="Chave PIX" name="pix_key" maxLength={120} />
        <div className="fp-form-grid">
          <Field label="Banco" name="bank_name" maxLength={120} />
          <Field label="Agência" name="bank_branch" maxLength={20} />
          <Field label="Conta" name="bank_account" maxLength={40} />
        </div>
      </MutationForm>
    </AuthShell>
  );
}
