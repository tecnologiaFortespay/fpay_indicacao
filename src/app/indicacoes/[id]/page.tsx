import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Field, SelectField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { requireRole } from "@/lib/auth/session";
import { formatCnpj } from "@/lib/cnpj";
import { competencyLabel, currentCompetency, dateToCompetency, formatDate } from "@/lib/competency";
import { referralStatusLabels, type ReferralStatus } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import { ruleInForce } from "@/lib/partners/queries";
import { referralConfigLabel, termLabel } from "@/lib/referrals/config";
import { getReferral, referralMonths } from "@/lib/referrals/queries";
import { allowedTransitions, referralStatusClass } from "@/lib/referrals/transitions";
import { setReferralConfig, setReferralStatus } from "../actions";

export const metadata: Metadata = { title: "Indicação" };

type PageProps = { params: Promise<{ id: string }> };

export default async function ReferralDetailPage({ params }: PageProps) {
  await requireRole("director");
  const { id } = await params;
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
    ? `${formatCurrency(rule.value_per_life)} por vida, ${rule.term_months === null ? "sem prazo" : `prazo de ${rule.term_months} meses`}`
    : "sem regra vigente";
  const effectiveTerm = referral.term_months ?? rule?.term_months ?? null;
  return (
    <AppShell title={referral.company_name}>
      <Link href="/indicacoes" className="fp-detail-back">
        ← Indicações
      </Link>
      <div className="fp-detail-total">
        <div>
          <span>Parceiro</span>
          <strong className="text-base">
            <Link href={`/parceiros/${referral.partner_id}`}>{referral.partner_name}</Link>
          </strong>
        </div>
        <div>
          <span>CNPJ</span>
          <strong className="text-base fp-num">{formatCnpj(referral.cnpj)}</strong>
        </div>
        <div>
          <span>Situação</span>
          <strong className="text-base">
            <span className={referralStatusClass(referral.status)}>{status}</span>
          </strong>
        </div>
        <div>
          <span>Indicada em</span>
          <strong className="text-base">{formatDate(referral.created_at)}</strong>
        </div>
        <div>
          <span>1º mês pago</span>
          <strong className="text-base">
            {referral.activated_competency
              ? competencyLabel(dateToCompetency(referral.activated_competency))
              : "—"}
          </strong>
        </div>
        <div>
          <span>Prazo</span>
          <strong className="text-base">
            {termLabel(effectiveTerm, referral.activated_competency)}
          </strong>
        </div>
      </div>

      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Configuração da indicação</h2>
          <span>hoje: {referralConfigLabel(referral.value_per_life, referral.term_months)}</span>
        </div>
        <div className="fp-form-section">
          <p className="mb-4 text-sm text-muted-foreground">
            Em branco, vale a regra do parceiro: {partnerRule}. O prazo conta a partir do primeiro
            mês pago. Meses já fechados não mudam.
          </p>
          <MutationForm action={setReferralConfig} label="Salvar configuração">
            <input type="hidden" name="id" value={referral.id} />
            <div className="fp-form-grid">
              <Field
                label="Valor por vida da indicação (R$)"
                name="value_per_life"
                inputMode="decimal"
                placeholder={rule ? String(rule.value_per_life).replace(".", ",") : "1,50"}
                defaultValue={
                  referral.value_per_life === null
                    ? ""
                    : Number(referral.value_per_life).toFixed(2).replace(".", ",")
                }
              />
              <Field
                label="Prazo da indicação em meses"
                name="term_months"
                type="number"
                min={1}
                max={120}
                defaultValue={referral.term_months === null ? "" : String(referral.term_months)}
              />
            </div>
          </MutationForm>
        </div>
      </section>

      {transitions.length > 0 && (
        <section className="fp-panel mt-6">
          <div className="fp-panel-heading">
            <h2>Situação</h2>
            <span>Ativa e Inadimplente mudam sozinhas a cada importação do BI</span>
          </div>
          <div className="fp-form-section">
            <MutationForm action={setReferralStatus} label="Alterar" pendingLabel="Alterando…">
              <input type="hidden" name="id" value={referral.id} />
              <div className="fp-inline-form">
                <SelectField
                  label={`Nova situação de ${referral.company_name}`}
                  name="status"
                  options={transitions}
                />
              </div>
            </MutationForm>
          </div>
        </section>
      )}

      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Vidas e valores por mês</h2>
          <span>meses em que as vidas desta indicação contam</span>
        </div>
        {months.length === 0 ? (
          <p className="fp-panel-footnote">Nenhum mês com vidas contando para esta indicação.</p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="fp-num">Vidas</th>
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
                        ? "sem regra vigente"
                        : formatCurrency(month.value_per_life)}
                    </td>
                    <td className="fp-num">{formatCurrency(month.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
