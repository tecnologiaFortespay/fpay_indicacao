import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field, SelectField } from "@/components/fields";
import { KeyValueStrip } from "@/components/key-value-strip";
import { MutationForm } from "@/components/mutation-form";
import { Notice } from "@/components/notice";
import { PanelBody, SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import { formatCnpj } from "@/lib/cnpj";
import {
  competencyLabel,
  currentCompetency,
  dateToCompetency,
  formatDate,
  shortCompetencyLabel,
} from "@/lib/competency";
import { glossary } from "@/lib/glossary";
import { referralStatusLabels, type ReferralStatus } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import { ruleInForce } from "@/lib/partners/queries";
import { referralConfigLabel, termLabel } from "@/lib/referrals/config";
import { getReferral, referralMonths } from "@/lib/referrals/queries";
import {
  referralExplanation,
  referralStage,
  stageLabels,
  statusChipClass,
} from "@/lib/referrals/stages";
import { allowedTransitions } from "@/lib/referrals/transitions";
import { setReferralConfig, setReferralSeller, setReferralStatus } from "../actions";

export const metadata: Metadata = { title: "Indicação" };

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> };

export default async function ReferralDetailPage({ params, searchParams }: PageProps) {
  await requireRole("director");
  const { id } = await params;
  const { msg } = await searchParams;
  if (!z.uuid().safeParse(id).success) {
    redirect("/indicacoes");
  }
  const referral = await getReferral(id);
  if (!referral) {
    notFound();
  }
  const [rule, months] = await Promise.all([
    ruleInForce(referral.partner_id, currentCompetency()),
    referralMonths(id),
  ]);
  const status = referralStatusLabels[referral.status as ReferralStatus] ?? referral.status;
  const transitions = allowedTransitions(referral.status).map(
    (value) => [value, referralStatusLabels[value]] as [string, string],
  );
  const partnerRule = rule
    ? `${formatCurrency(rule.value_per_life)} por vida · ${rule.term_months === null ? "sem prazo" : `prazo de ${rule.term_months} meses`}`
    : "sem regra neste mês";
  const effectiveValue = referral.value_per_life ?? rule?.value_per_life ?? null;
  const effectiveTerm = referral.term_months ?? rule?.term_months ?? null;
  const ownConfig = referral.value_per_life !== null || referral.term_months !== null;
  const stage = referralStage(referral.status);
  return (
    <AppShell title={referral.company_name} flash={msg}>
      <Link href="/indicacoes" className="fp-detail-back">
        ← Indicações
      </Link>
      <KeyValueStrip
        facts={[
          [
            "Parceiro",
            <Link key="partner" href={`/parceiros/${referral.partner_id}`} className="underline">
              {referral.partner_name}
            </Link>,
          ],
          [
            "CNPJ",
            <span key="cnpj" className="fp-num">
              {formatCnpj(referral.cnpj)}
            </span>,
          ],
          [
            "Situação",
            <span key="status" className={statusChipClass(referral.status)}>
              {status}
            </span>,
          ],
          ["Indicada em", formatDate(referral.created_at)],
          [
            "1º mês pago",
            referral.activated_competency
              ? shortCompetencyLabel(dateToCompetency(referral.activated_competency))
              : "—",
          ],
          ["Prazo", termLabel(effectiveTerm, referral.activated_competency)],
          [
            "Vidas estimadas",
            referral.estimated_lives === null ? "—" : formatInteger(referral.estimated_lives),
          ],
          ["Vendedor", referral.seller_name ?? "—"],
        ]}
      />

      <Notice
        tone={stage === "earning" ? "success" : stage === "closed" ? "warning" : "info"}
        title={stageLabels[stage]}
      >
        {referralExplanation(referral, { valuePerLife: effectiveValue, termMonths: effectiveTerm })}
      </Notice>

      <SectionCard
        title="Valor e prazo desta indicação"
        subtitle={
          ownConfig
            ? `Hoje: ${referralConfigLabel(referral.value_per_life, referral.term_months)} (combinado só para esta indicação).`
            : `Hoje: regra do parceiro (${partnerRule}).`
        }
        footnote="Deixe em branco para seguir a regra do parceiro. O prazo conta a partir do primeiro mês pago. Meses já fechados não mudam."
      >
        <PanelBody>
          <MutationForm
            action={setReferralConfig}
            label="Salvar valor e prazo"
            resetOnSuccess={false}
          >
            <input type="hidden" name="id" value={referral.id} />
            <div className="fp-form-grid">
              <Field
                label={glossary.referralValue.label}
                name="value_per_life"
                inputMode="decimal"
                placeholder={
                  rule ? `regra: ${String(rule.value_per_life).replace(".", ",")}` : "1,50"
                }
                defaultValue={
                  referral.value_per_life === null
                    ? ""
                    : Number(referral.value_per_life).toFixed(2).replace(".", ",")
                }
                hint={glossary.referralValue.hint}
              />
              <Field
                label={glossary.referralTerm.label}
                name="term_months"
                type="number"
                min={1}
                max={120}
                placeholder="regra do parceiro"
                defaultValue={referral.term_months === null ? "" : String(referral.term_months)}
                hint={glossary.referralTerm.hint}
              />
            </div>
          </MutationForm>
        </PanelBody>
      </SectionCard>

      <SectionCard
        title="Vendedor da indicação"
        subtitle="Quem da equipe do parceiro fez esta indicação. Texto livre; em branco apaga. Aparece nas listas e no fechamento; login e comissão de vendedor ficam para a fase 2."
      >
        <PanelBody>
          <MutationForm action={setReferralSeller} label="Salvar vendedor" resetOnSuccess={false}>
            <input type="hidden" name="id" value={referral.id} />
            <Field
              label="Vendedor"
              name="seller_name"
              maxLength={120}
              defaultValue={referral.seller_name ?? ""}
            />
          </MutationForm>
        </PanelBody>
      </SectionCard>

      <SectionCard
        title="Mudar situação"
        subtitle="Ativa e Inadimplente mudam sozinhas a cada envio da planilha do BI. Aqui você registra o andamento da negociação, a perda ou o cancelamento."
      >
        <PanelBody>
          {transitions.length === 0 ? (
            <p className="fp-help">
              Indicação cancelada: a situação não muda mais. Os meses em que ela rendeu continuam
              valendo.
            </p>
          ) : (
            <MutationForm
              action={setReferralStatus}
              label="Mudar situação"
              pendingLabel="Alterando…"
            >
              <input type="hidden" name="id" value={referral.id} />
              <input type="hidden" name="return_to" value={`/indicacoes/${referral.id}`} />
              <div className="fp-form-grid">
                <SelectField
                  label={`Nova situação de ${referral.company_name}`}
                  name="status"
                  options={transitions}
                />
              </div>
            </MutationForm>
          )}
        </PanelBody>
      </SectionCard>

      <SectionCard
        title="Vidas e valores por mês"
        subtitle="Meses em que as vidas desta indicação contam para a comissão."
      >
        {months.length === 0 ? (
          <EmptyState title="Nenhum mês com vidas ainda">
            Aparece aqui quando o cliente tiver vidas pagas numa planilha do BI.
          </EmptyState>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="fp-num">Vidas pagas</th>
                  <th className="fp-num">Valor por vida</th>
                  <th className="fp-num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.competency}>
                    <td>{competencyLabel(dateToCompetency(month.competency))}</td>
                    <td className="fp-num">{formatInteger(month.lives)}</td>
                    <td className="fp-num">
                      {month.value_per_life === null
                        ? "sem regra"
                        : formatCurrency(month.value_per_life)}
                    </td>
                    <td className="fp-num">{formatCurrency(month.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
