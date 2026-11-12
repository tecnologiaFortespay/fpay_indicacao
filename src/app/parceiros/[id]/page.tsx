import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { ApprovalForm, RejectionForm } from "@/components/approval-form";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/fields";
import { FormDisclosure } from "@/components/form-disclosure";
import { KeyValueStrip } from "@/components/key-value-strip";
import { MutationForm } from "@/components/mutation-form";
import { Notice } from "@/components/notice";
import { PartnerForm } from "@/components/partner-form";
import { RulesCard } from "@/components/rules-card";
import { PanelBody, SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import { lastClosedCompetency } from "@/lib/closings/queries";
import { formatCnpj } from "@/lib/cnpj";
import {
  competencyLabel,
  currentCompetency,
  dateToCompetency,
  formatDate,
  shortCompetencyLabel,
} from "@/lib/competency";
import { glossary } from "@/lib/glossary";
import { partnerKindLabels, partnerStatusLabels, referralStatusLabels } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import {
  getPartner,
  listPartnerMonthAmounts,
  listPartnerReferrals,
  listPartnerRules,
  listReferralRules,
  partnerLogin,
  type Partner,
} from "@/lib/partners/queries";
import { referralRuleSummary } from "@/lib/referrals/config";
import { statusChipClass } from "@/lib/referrals/stages";
import { createPasswordReset, createReferral } from "../actions";

export const metadata: Metadata = { title: "Parceiro" };

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> };

function placeOf(partner: Partner): string {
  if (!partner.city) {
    return "—";
  }
  return partner.state ? `${partner.city}/${partner.state}` : partner.city;
}

// Mesma faixa de dados para parceiro aguardando, recusado ou ativo.
function PartnerFacts({ partner }: { partner: Partner }) {
  const kind = partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind;
  const status =
    partnerStatusLabels[partner.status as keyof typeof partnerStatusLabels] ?? partner.status;
  const contact = [partner.contact_email, partner.contact_phone].filter(Boolean).join(" · ") || "—";
  return (
    <KeyValueStrip
      facts={[
        ["Situação", status],
        ["Tipo", kind],
        ["Local", placeOf(partner)],
        ["Responsável", partner.contact_name ?? "—"],
        ["Contato", contact],
        ["Cadastrado em", formatDate(partner.created_at)],
        ["Aprovado em", partner.approved_at ? formatDate(partner.approved_at) : "—"],
      ]}
    />
  );
}

function BackLink() {
  return (
    <Link href="/parceiros" className="fp-detail-back">
      ← Parceiros
    </Link>
  );
}

function PendingPartner({ partner, flash }: { partner: Partner; flash?: string }) {
  const rejected = partner.status === "rejected";
  return (
    <AppShell title={partner.name} flash={flash}>
      <BackLink />
      <PartnerFacts partner={partner} />
      {rejected && (
        <Notice tone="danger" title="Cadastro recusado">
          Motivo: {partner.rejection_reason ?? "não informado"}. O parceiro vê este motivo ao entrar
          e continua sem acesso.
        </Notice>
      )}
      <SectionCard
        title={rejected ? "Reconsiderar: aprovar o cadastro" : "Aprovar o cadastro"}
        subtitle="Para liberar o acesso, defina quanto este parceiro recebe por vida paga. Depois dá para criar novas vigências e dar valor próprio a uma indicação."
      >
        <PanelBody>
          <ApprovalForm partner={partner} label="Aprovar e liberar acesso" />
        </PanelBody>
      </SectionCard>
      {!rejected && (
        <SectionCard
          title="Ou recusar o cadastro"
          subtitle="O parceiro continua sem acesso e vê o motivo que você escrever."
        >
          <PanelBody>
            <RejectionForm partner={partner} />
          </PanelBody>
        </SectionCard>
      )}
    </AppShell>
  );
}

export default async function PartnerDetailPage({ params, searchParams }: PageProps) {
  await requireRole("director");
  const { id } = await params;
  const { msg } = await searchParams;
  if (!z.uuid().safeParse(id).success) {
    redirect("/parceiros");
  }
  const partner = await getPartner(id);
  if (!partner) {
    notFound();
  }
  if (partner.status !== "active") {
    return <PendingPartner partner={partner} flash={msg} />;
  }
  const [rules, referrals, amounts, lockedThrough, login] = await Promise.all([
    listPartnerRules(id),
    listPartnerReferrals(id),
    listPartnerMonthAmounts(id),
    lastClosedCompetency(),
    partnerLogin(id),
  ]);
  const today = currentCompetency();
  const ownRules = await listReferralRules(referrals.map((referral) => referral.id));
  return (
    <AppShell title={partner.name} flash={msg}>
      <BackLink />
      <PartnerFacts partner={partner} />

      <RulesCard
        title="Regra de remuneração"
        subtitle="Quanto este parceiro recebe por vida paga, para as indicações feitas a partir de cada vigência. Indicações com valor próprio usam o delas."
        footnote="Uma vigência nova vale do mês dela em diante, para quem for indicado a partir dele; indicações anteriores seguem a regra de quando foram feitas. Só a mais recente pode ser editada, e só enquanto nenhum mês fechado a usa."
        rules={rules}
        partnerId={partner.id}
        today={today}
        lockedThrough={lockedThrough}
        emptyText="Sem regra cadastrada: as vidas deste parceiro contam com valor zero até existir uma vigência."
      />

      <SectionCard
        title={`Indicações deste parceiro (${referrals.length})`}
        subtitle="Só a indicação Ativa rende comissão. Abra uma indicação para dar a ela valor ou prazo próprios."
      >
        {referrals.length === 0 ? (
          <EmptyState title="Nenhuma indicação registrada">
            O parceiro registra as indicações pelo portal dele; você também pode registrar abaixo.
          </EmptyState>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Situação</th>
                  <th>Rende desde</th>
                  <th>Valor e prazo hoje</th>
                  <th className="fp-num">Vidas estimadas</th>
                  <th>Indicada em</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>
                      <Link href={`/indicacoes/${referral.id}`}>{referral.company_name}</Link>
                      <small className="fp-num">{formatCnpj(referral.cnpj)}</small>
                      {referral.seller_name && <small>Vendedor: {referral.seller_name}</small>}
                    </td>
                    <td>
                      <span className={statusChipClass(referral.status)}>
                        {referralStatusLabels[
                          referral.status as keyof typeof referralStatusLabels
                        ] ?? referral.status}
                      </span>
                    </td>
                    <td>
                      {referral.activated_competency
                        ? shortCompetencyLabel(dateToCompetency(referral.activated_competency))
                        : "—"}
                    </td>
                    <td>
                      {(() => {
                        const terms = referralRuleSummary(ownRules.get(referral.id) ?? [], today);
                        return (
                          <>
                            {terms.label}
                            {terms.note && <small>{terms.note}</small>}
                          </>
                        );
                      })()}
                    </td>
                    <td className="fp-num">
                      {referral.estimated_lives === null
                        ? "—"
                        : formatInteger(referral.estimated_lives)}
                    </td>
                    <td>{formatDate(referral.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <FormDisclosure
          label="Registrar indicação em nome do parceiro"
          description="Na prática o parceiro registra pelo portal; use aqui quando ele pedir."
        >
          <MutationForm action={createReferral} label="Registrar indicação">
            <input type="hidden" name="partner_id" value={partner.id} />
            <div className="fp-form-grid">
              <Field
                label="CNPJ do cliente"
                name="cnpj"
                required
                maxLength={18}
                placeholder="00.000.000/0000-00"
              />
              <Field label="Empresa" name="company_name" required maxLength={240} />
              <Field label="Vidas estimadas" name="estimated_lives" type="number" min={0} />
              <Field
                label="Vendedor"
                name="seller_name"
                maxLength={120}
                hint="Quem da equipe do parceiro fez a indicação, se houver."
              />
              <Field
                label={glossary.referralValue.label}
                name="value_per_life"
                inputMode="decimal"
                placeholder="regra do parceiro"
                hint={glossary.referralValue.hint}
              />
              <Field
                label={glossary.referralTerm.label}
                name="term_months"
                type="number"
                min={1}
                max={120}
                placeholder="regra do parceiro"
                hint={glossary.referralTerm.hint}
              />
            </div>
          </MutationForm>
        </FormDisclosure>
      </SectionCard>

      <SectionCard
        title="Vidas e valores por mês"
        subtitle="Últimos 12 meses com vidas nas planilhas do BI."
        footnote="O valor soma cada indicação com o valor por vida dela: a vigência própria, quando houver, ou a regra do parceiro de quando a indicação foi feita. Meses fechados: o valor oficial está em Fechamento do mês."
      >
        {amounts.length === 0 ? (
          <EmptyState title="Nenhuma vida paga ainda">
            Aparece aqui quando alguma indicação deste parceiro tiver vidas numa planilha do BI.
          </EmptyState>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="fp-num">Vidas pagas</th>
                  <th className="fp-num">Valor por vida (regra)</th>
                  <th className="fp-num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {amounts.map((row) => (
                  <tr key={row.competency}>
                    <td>{competencyLabel(dateToCompetency(row.competency))}</td>
                    <td className="fp-num">{formatInteger(row.lives)}</td>
                    <td className="fp-num">
                      {row.value_per_life === null
                        ? "sem regra"
                        : formatCurrency(row.value_per_life)}
                    </td>
                    <td className="fp-num">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Acesso ao sistema"
        subtitle={
          login
            ? `Login do parceiro: ${partner.contact_email ?? "e-mail do cadastro"}.`
            : "Este parceiro ainda não tem login."
        }
      >
        <PanelBody>
          {login ? (
            <MutationForm
              action={createPasswordReset}
              label="Gerar link de nova senha"
              pendingLabel="Gerando…"
              variant="outline"
              linkLabel="Link de nova senha"
            >
              <p className="fp-help">
                Se o parceiro esqueceu a senha, gere o link e envie a ele (WhatsApp, e-mail). Ele
                abre o link, define a senha nova e entra. O link vale por 24 horas e uma única vez;
                gerar outro invalida o anterior.
              </p>
              <input type="hidden" name="partner_id" value={partner.id} />
            </MutationForm>
          ) : (
            <p className="fp-help">
              O login nasce quando o parceiro faz o cadastro pelo link do convite.
            </p>
          )}
        </PanelBody>
      </SectionCard>

      <SectionCard
        title="Dados do cadastro"
        subtitle="Preenchidos pelo parceiro; só o diretor altera."
      >
        <FormDisclosure label="Editar dados do cadastro">
          <PartnerForm partner={partner} />
        </FormDisclosure>
      </SectionCard>
    </AppShell>
  );
}
