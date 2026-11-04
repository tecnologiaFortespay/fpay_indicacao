import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field, SelectField } from "@/components/fields";
import { FormDisclosure } from "@/components/form-disclosure";
import { MutationForm } from "@/components/mutation-form";
import { OrbitaIcon } from "@/components/orbita-icon";
import { PageIntro } from "@/components/page-intro";
import { SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import { currentCompetency, formatDate } from "@/lib/competency";
import { invitationStatus, listInvitations } from "@/lib/invitations/queries";
import { invitationStatusLabels, partnerKindLabels } from "@/lib/labels";
import { listAllRules, listPartners, type Partner } from "@/lib/partners/queries";
import { currentRule, ruleSentence } from "@/lib/referrals/config";
import { createInvitation } from "./actions";

export const metadata: Metadata = { title: "Parceiros" };

const kindOptions = Object.entries(partnerKindLabels) as [string, string][];

function defaultValidUntil(): string {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + sevenDays).toISOString().slice(0, 10);
}

function kindOf(partner: Partner): string {
  return partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind;
}

function placeOf(partner: Partner): string {
  if (!partner.city) {
    return "—";
  }
  return partner.state ? `${partner.city}/${partner.state}` : partner.city;
}

function PendingRow({ partner }: { partner: Partner }) {
  return (
    <Link className="fp-action-row" href={`/parceiros/${partner.id}`}>
      <span>
        <strong>{partner.name}</strong>
        <small>
          {kindOf(partner)} · {placeOf(partner)}
          {partner.contact_name ? ` · ${partner.contact_name}` : ""} · cadastrado em{" "}
          {formatDate(partner.created_at)}
        </small>
      </span>
      <span className="fp-action-label">
        Analisar e aprovar
        <OrbitaIcon name="arrow" />
      </span>
    </Link>
  );
}

export default async function PartnersPage() {
  await requireRole("director");
  const [partners, invitations, rules] = await Promise.all([
    listPartners(),
    listInvitations(),
    listAllRules(),
  ]);
  const today = currentCompetency();
  const pending = partners.filter((partner) => partner.status === "pending");
  const active = partners.filter((partner) => partner.status === "active");
  const rejected = partners.filter((partner) => partner.status === "rejected");
  const openInvitations = invitations.filter(
    (invitation) => invitationStatus(invitation) === "open",
  );
  return (
    <AppShell title="Parceiros">
      <PageIntro>
        Unidades e parceiros externos que indicam clientes. Parceiro novo entra por convite: você
        gera o link, ele preenche o cadastro e você aprova definindo quanto ele recebe por vida.
      </PageIntro>

      <SectionCard
        title={`Aguardando aprovação (${pending.length})`}
        subtitle="Cadastros feitos pelo link do convite. O parceiro só entra no sistema depois que você aprova."
      >
        {pending.length === 0 ? (
          <EmptyState title="Nenhum cadastro aguardando">
            {openInvitations.length > 0
              ? `Há ${openInvitations.length} convite(s) ainda sem cadastro. Quando o parceiro preencher, ele aparece aqui.`
              : "Gere um convite abaixo e envie o link ao parceiro."}
          </EmptyState>
        ) : (
          pending.map((partner) => <PendingRow key={partner.id} partner={partner} />)
        )}
      </SectionCard>

      <SectionCard
        title={`Ativos (${active.length})`}
        subtitle="Parceiros aprovados, com acesso ao portal."
      >
        {active.length === 0 ? (
          <EmptyState title="Nenhum parceiro aprovado ainda" />
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th>Tipo</th>
                  <th>Local</th>
                  <th>Responsável</th>
                  <th>Regra hoje</th>
                </tr>
              </thead>
              <tbody>
                {active.map((partner) => {
                  const rule = currentRule(
                    rules.filter((item) => item.partner_id === partner.id),
                    today,
                  );
                  return (
                    <tr key={partner.id}>
                      <td>
                        <Link href={`/parceiros/${partner.id}`}>{partner.name}</Link>
                      </td>
                      <td>{kindOf(partner)}</td>
                      <td>{placeOf(partner)}</td>
                      <td>{partner.contact_name ?? "—"}</td>
                      <td>{rule ? ruleSentence(rule, today) : "sem regra"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {rejected.length > 0 && (
        <SectionCard
          title={`Recusados (${rejected.length})`}
          subtitle="Sem acesso. Abra para ver o motivo ou reconsiderar."
        >
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th>Tipo</th>
                  <th>Motivo da recusa</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map((partner) => (
                  <tr key={partner.id}>
                    <td>
                      <Link href={`/parceiros/${partner.id}`}>{partner.name}</Link>
                    </td>
                    <td>{kindOf(partner)}</td>
                    <td>{partner.rejection_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Convites"
        subtitle="Cada convite é um link de uso único: o parceiro abre, preenche o cadastro e fica aguardando a sua aprovação."
      >
        <FormDisclosure
          label="Gerar convite"
          open={invitations.length === 0}
          description="Depois de gerar, copie o link na hora e envie ao parceiro por WhatsApp ou e-mail: por segurança ele aparece uma vez só, e o sistema não envia sozinho."
        >
          <MutationForm action={createInvitation} label="Gerar convite" pendingLabel="Gerando…">
            <div className="fp-form-grid fp-form-grid-3">
              <Field
                label="Nome da unidade ou do parceiro"
                name="partner_name"
                required
                maxLength={160}
                hint="Aparece no convite; o parceiro pode corrigir no cadastro."
              />
              <SelectField label="Tipo" name="kind" options={kindOptions} defaultValue="unit" />
              <Field
                label="Válido até"
                name="valid_until"
                type="date"
                required
                defaultValue={defaultValidUntil()}
                hint="Até o fim deste dia (horário de Fortaleza)."
              />
            </div>
          </MutationForm>
        </FormDisclosure>
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
                          <span
                            className={
                              status === "open"
                                ? "fp-status fp-status-pending"
                                : "fp-status fp-status-muted"
                            }
                          >
                            {invitationStatusLabels[status]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
