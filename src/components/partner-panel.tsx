import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field } from "@/components/fields";
import type { AuthorizedUser } from "@/lib/auth/session";
import { formatCnpj } from "@/lib/cnpj";
import {
  competencyLabel,
  currentCompetency,
  currentDayOfMonth,
  dateToCompetency,
  formatDate,
  formatDateTime,
  isCompetency,
} from "@/lib/competency";
import {
  partnerDecisionLabels,
  partnerResponseLabels,
  referralStatusLabels,
  type ReferralStatus,
} from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import {
  lastImportAt,
  partnerClosingItems,
  partnerMonthSummary,
  pendingBalanceOf,
} from "@/lib/partner-panel/queries";
import { ruleInForce } from "@/lib/partners/queries";
import { termLabel } from "@/lib/referrals/config";
import { listReferrals, referralMonthValues, type ReferralRow } from "@/lib/referrals/queries";
import { referralStatusClass } from "@/lib/referrals/transitions";

type PartnerPanelProps = {
  user: AuthorizedUser;
  requestedCompetency?: string;
};

// Clientes que aparecem no mês: os que tiveram vidas contando nele, mais os ativos e
// inadimplentes que já tinham começado a pagar (inadimplente aparece com 0 para ser cobrado).
function shownInMonth(referral: ReferralRow, competency: string, hasLives: boolean): boolean {
  if (hasLives) {
    return true;
  }
  const ongoing = referral.status === "active" || referral.status === "delinquent";
  const started =
    referral.activated_competency !== null &&
    dateToCompetency(referral.activated_competency) <= competency;
  return ongoing && started;
}

// Painel do parceiro (seção 8): vidas pagas até hoje, quanto vai receber, saldo pendente,
// histórico e "dados atualizados em", com valor e prazo de cada indicação. Tudo sob a RLS dele.
export async function PartnerPanel({ user, requestedCompetency }: PartnerPanelProps) {
  const partnerId = user.profile.partner?.id ?? "";
  const partnerName = user.profile.partner?.name ?? "";
  const current = currentCompetency();
  const competency = isCompetency(requestedCompetency) ? requestedCompetency : current;
  const [summary, referrals, months, closings, updatedAt, rule] = await Promise.all([
    partnerMonthSummary(partnerId, competency),
    listReferrals({ partnerId }),
    referralMonthValues(competency),
    partnerClosingItems(partnerId),
    lastImportAt(),
    ruleInForce(partnerId, competency),
  ]);
  const pending = pendingBalanceOf(closings);
  const latestClosing = closings[0] ?? null;
  const closedMonth = closings.find((item) => item.competency === competency) ?? null;
  const monthLabel = competencyLabel(competency);
  const isCurrentMonth = competency === current;
  const rows = referrals.filter((referral) =>
    shownInMonth(referral, competency, months.has(referral.id)),
  );
  const delinquent = referrals.filter((referral) => referral.status === "delinquent");
  const ruleText = rule
    ? `${formatCurrency(rule.value_per_life)} por vida${rule.term_months === null ? "" : ` · prazo de ${rule.term_months} meses`}`
    : "sem regra vigente";
  return (
    <AppShell title="Meu painel">
      <div className="fp-portal-heading">
        <p>{partnerName}</p>
        <form>
          <Field name="competency" label="Mês" type="month" defaultValue={competency} required />
          <button className="fp-button-secondary">Consultar</button>
        </form>
      </div>
      <div className="fp-kpi-grid">
        <article className="fp-kpi">
          <div className="fp-kpi-heading">
            <h2>Vidas pagas</h2>
            <span>
              {isCurrentMonth ? `${monthLabel} · até o dia ${currentDayOfMonth()}` : monthLabel}
            </span>
          </div>
          <p className="fp-kpi-value fp-num">{formatInteger(summary.lives)}</p>
          <p className="fp-kpi-description">
            Vidas dos seus clientes indicados que pagaram no mês, pela base do BI.
          </p>
        </article>
        <article className="fp-kpi fp-kpi-preview">
          <div className="fp-kpi-heading">
            <h2>Valor a receber (prévia)</h2>
            <span>{ruleText}</span>
          </div>
          <p className="fp-kpi-value fp-num">{formatCurrency(summary.amount)}</p>
          <p className="fp-kpi-description">
            Vidas × valor por vida de cada indicação. O valor definitivo é o do fechamento do mês.
          </p>
        </article>
        <article className="fp-kpi fp-kpi-hero">
          <div className="fp-kpi-heading">
            <h2>Saldo pendente</h2>
            <span>
              {latestClosing
                ? `após ${competencyLabel(latestClosing.competency)}`
                : "nenhum fechamento"}
            </span>
          </div>
          <p className="fp-kpi-value fp-num">{formatCurrency(pending)}</p>
          <p className="fp-kpi-description">
            Valor acumulado que ainda não foi pago; entra no próximo fechamento.
          </p>
          <Link className="fp-kpi-link" href="/fechamentos">
            Meus fechamentos →
          </Link>
        </article>
        <article className="fp-kpi">
          <div className="fp-kpi-heading">
            <h2>Último fechamento</h2>
            <span>{latestClosing ? competencyLabel(latestClosing.competency) : "—"}</span>
          </div>
          <p className="fp-kpi-value fp-num">
            {latestClosing ? formatCurrency(latestClosing.total) : "—"}
          </p>
          <p className="fp-kpi-description">
            {latestClosing
              ? `${latestClosing.decision ? partnerDecisionLabels[latestClosing.decision as keyof typeof partnerDecisionLabels] : "Sem valor"}${latestClosing.partner_response ? ` · ${partnerResponseLabels[latestClosing.partner_response as keyof typeof partnerResponseLabels]}` : " · aguardando sua confirmação"}`
              : "Quando a Fortes Pay fechar um mês, o valor aparece aqui para você confirmar."}
          </p>
        </article>
      </div>
      <p className="fp-preview-note">
        <strong>Dados atualizados em {updatedAt ? formatDateTime(updatedAt) : "—"}</strong>
        <span>A Fortes Pay importa a base do BI duas a três vezes por semana.</span>
      </p>
      {closedMonth && (
        <p className="fp-panel-footnote mb-4">
          {monthLabel} já foi fechado
          {closedMonth.closed_at ? ` em ${formatDate(closedMonth.closed_at)}` : ""}: o valor oficial
          é o do fechamento, {formatCurrency(closedMonth.total)}, em Meus fechamentos.
        </p>
      )}
      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Minhas indicações · {monthLabel}</h2>
          <Link href="/indicacoes">Todas as indicações →</Link>
        </div>
        {rows.length === 0 ? (
          <p className="fp-panel-footnote">
            Nenhum cliente seu com vidas pagas ou em cobrança neste mês.
          </p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Situação</th>
                  <th className="fp-num">Vidas no mês</th>
                  <th className="fp-num">Valor por vida</th>
                  <th className="fp-num">Valor</th>
                  <th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((referral) => {
                  const month = months.get(referral.id);
                  const valuePerLife =
                    month?.value_per_life ??
                    referral.value_per_life ??
                    rule?.value_per_life ??
                    null;
                  const term = referral.term_months ?? rule?.term_months ?? null;
                  return (
                    <tr key={referral.id}>
                      <td>{referral.company_name}</td>
                      <td className="fp-num">{formatCnpj(referral.cnpj)}</td>
                      <td>
                        <span className={referralStatusClass(referral.status)}>
                          {referralStatusLabels[referral.status as ReferralStatus] ??
                            referral.status}
                        </span>
                      </td>
                      <td className="fp-num">{formatInteger(month?.lives ?? 0)}</td>
                      <td className="fp-num">
                        {valuePerLife === null ? "sem regra" : formatCurrency(valuePerLife)}
                      </td>
                      <td className="fp-num">{formatCurrency(month?.amount ?? 0)}</td>
                      <td>{termLabel(term, referral.activated_competency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="fp-panel-footnote">
          {delinquent.length > 0
            ? `${delinquent.length} cliente(s) inadimplente(s) no último mês importado: vale uma conversa para não perder a recorrência.`
            : "Inadimplente = cliente ativo que não pagou no último mês importado."}
        </p>
      </section>
      <p className="fp-data-reference">
        Vidas e valores vêm da base do BI importada pela Fortes Pay. O valor por vida e o prazo são
        os da indicação, quando a Fortes Pay definiu, ou os da sua regra vigente no mês.
      </p>
    </AppShell>
  );
}
