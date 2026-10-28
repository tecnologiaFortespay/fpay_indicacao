import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field, SelectField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { OrbitaIcon } from "@/components/orbita-icon";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/competency";
import { invitationStatus, listInvitations } from "@/lib/invitations/queries";
import {
  invitationStatusLabels,
  partnerKindLabels,
  partnerStatusLabels,
  paymentMethodLabels,
} from "@/lib/labels";
import { listPartners, type Partner } from "@/lib/partners/queries";
import { createInvitation } from "./actions";

export const metadata: Metadata = { title: "Parceiros" };

const kindOptions = Object.entries(partnerKindLabels) as [string, string][];

function statusClass(status: string): string {
  if (status === "active") {
    return "fp-status fp-status-success";
  }
  if (status === "pending") {
    return "fp-status fp-status-pending";
  }
  return "fp-status";
}

function defaultValidUntil(): string {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + sevenDays).toISOString().slice(0, 10);
}

function PartnerRow({ partner }: { partner: Partner }) {
  const kind = partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind;
  const place = partner.city ? ` · ${partner.city}${partner.state ? `/${partner.state}` : ""}` : "";
  const payment = partner.payment_method
    ? ` · ${paymentMethodLabels[partner.payment_method as keyof typeof paymentMethodLabels]}`
    : "";
  const status =
    partnerStatusLabels[partner.status as keyof typeof partnerStatusLabels] ?? partner.status;
  return (
    <Link className="fp-action-row" href={`/parceiros/${partner.id}`}>
      <span>
        <strong>{partner.name}</strong>
        <small>
          {kind}
          {place}
          {payment}
          {partner.contact_name ? ` · ${partner.contact_name}` : ""}
        </small>
      </span>
      <span className="fp-action-label">
        <span className={statusClass(partner.status)}>{status}</span>
        <OrbitaIcon name="arrow" />
      </span>
    </Link>
  );
}

export default async function PartnersPage() {
  await requireRole("director");
  const [partners, invitations] = await Promise.all([listPartners(), listInvitations()]);
  const pending = partners.filter((partner) => partner.status === "pending");
  const others = partners.filter((partner) => partner.status !== "pending");
  return (
    <AppShell title="Parceiros">
      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Aguardando aprovação</h2>
          <span>{pending.length} cadastro(s)</span>
        </div>
        {pending.map((partner) => (
          <PartnerRow key={partner.id} partner={partner} />
        ))}
        {pending.length === 0 && (
          <p className="fp-panel-footnote">
            Nenhum cadastro aguardando. Quem recebe um convite aparece aqui.
          </p>
        )}
      </section>

      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Parceiros</h2>
          <span>{others.length} parceiro(s)</span>
        </div>
        {others.map((partner) => (
          <PartnerRow key={partner.id} partner={partner} />
        ))}
        {others.length === 0 && (
          <p className="fp-panel-footnote">Nenhum parceiro aprovado ainda.</p>
        )}
      </section>

      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Convites</h2>
          <span>o parceiro abre o link, preenche o cadastro e fica aguardando aprovação</span>
        </div>
        <div className="fp-form-section">
          <h3>Gerar convite</h3>
          <MutationForm action={createInvitation} label="Gerar convite" pendingLabel="Gerando…">
            <div className="fp-form-grid">
              <Field
                label="Nome da unidade ou do indicador"
                name="partner_name"
                required
                maxLength={160}
              />
              <SelectField label="Tipo" name="kind" options={kindOptions} defaultValue="unit" />
              <Field
                label="Válido até (fim do dia, horário de Fortaleza)"
                name="valid_until"
                type="date"
                required
                defaultValue={defaultValidUntil()}
              />
            </div>
          </MutationForm>
        </div>
        {invitations.length > 0 && (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Convite para</th>
                  <th>Tipo</th>
                  <th>Criado em</th>
                  <th>Válido até</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const status = invitationStatus(invitation);
                  return (
                    <tr key={invitation.id}>
                      <td>{invitation.partner_name}</td>
                      <td>
                        {partnerKindLabels[invitation.kind as keyof typeof partnerKindLabels] ??
                          invitation.kind}
                      </td>
                      <td>{formatDate(invitation.created_at)}</td>
                      <td>{formatDate(invitation.expires_at)}</td>
                      <td>
                        {status === "used" && invitation.partner_id ? (
                          <Link href={`/parceiros/${invitation.partner_id}`}>
                            {invitationStatusLabels[status]}
                          </Link>
                        ) : (
                          invitationStatusLabels[status]
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
