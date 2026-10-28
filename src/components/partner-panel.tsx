import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field } from "@/components/fields";
import type { AuthorizedUser } from "@/lib/auth/session";
import { formatCnpj } from "@/lib/cnpj";
import {
  competencyLabel,
  currentCompetency,
  currentDayOfMonth,
  formatDate,
  formatDateTime,
  isCompetency,
} from "@/lib/competency";
import {
  decisionLabels,
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
import { listReferrals, livesByReferral } from "@/lib/referrals/queries";
import { referralStatusClass } from "@/lib/referrals/transitions";

type PartnerPanelProps = {
  user: AuthorizedUser;
  requestedCompetency?: string;
};

// Painel do parceiro (seção 8): vidas pagas até hoje, quanto vai receber, saldo pendente,
// histórico e "dados atualizados em". Tudo sob a RLS do próprio parceiro.
export async function PartnerPanel({ user, requestedCompetency }: PartnerPanelProps) {
  const partnerId = user.profile.partner?.id ?? "";
  const partnerName = user.profile.partner?.name ?? "";
  const current = currentCompetency();
  const competency = isCompetency(requestedCompetency) ? requestedCompetency : current;
  const [summary, referrals, lives, closings, updatedAt] = await Promise.all([
    partnerMonthSummary(partnerId, competency),
    listReferrals({ partnerId }),
    livesByReferral(competency),
    partnerClosingItems(partnerId),
    lastImportAt(),
  ]);
  const pending = pendingBalanceOf(closings);
  const latestClosing = closings[0] ?? null;
  const monthLabel = competencyLabel(competency);
  const isCurrentMonth = competency === current;
  const delinquent = referrals.filter((referral) => referral.status === "delinquent");
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
            <span>
              {summary.value_per_life
                ? `${formatCurrency(summary.value_per_life)} por vida`
                : "sem regra vigente"}
            </span>
          </div>
          <p className="fp-kpi-value fp-num">{formatCurrency(summary.amount)}</p>
          <p className="fp-kpi-description">
            Vidas × valor por vida. O valor definitivo é o do fechamento do mês.
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
              ? `${latestClosing.decision ? decisionLabels[latestClosing.decision as keyof typeof decisionLabels] : "Sem valor"}${latestClosing.partner_response ? ` · ${partnerResponseLabels[latestClosing.partner_response as keyof typeof partnerResponseLabels]}` : " · aguardando sua confirmação"}`
              : "Quando a Fortes Pay fechar um mês, o valor aparece aqui para você confirmar."}
          </p>
        </article>
      </div>
      <p className="fp-preview-note">
        <strong>Dados atualizados em {updatedAt ? formatDateTime(updatedAt) : "—"}</strong>
        <span>A Fortes Pay importa a base do BI duas a três vezes por semana.</span>
      </p>
      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Minhas indicações · {monthLabel}</h2>
          <Link href="/indicacoes">Registrar indicação →</Link>
        </div>
        {referrals.length === 0 ? (
          <p className="fp-panel-footnote">Você ainda não registrou indicações.</p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Situação</th>
                  <th className="fp-num">Vidas no mês</th>
                  <th>Indicada em</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>{referral.company_name}</td>
                    <td className="fp-num">{formatCnpj(referral.cnpj)}</td>
                    <td>
                      <span className={referralStatusClass(referral.status)}>
                        {referralStatusLabels[referral.status as ReferralStatus] ?? referral.status}
                      </span>
                    </td>
                    <td className="fp-num">
                      {lives.has(referral.id) ? formatInteger(lives.get(referral.id)) : "—"}
                    </td>
                    <td>{formatDate(referral.created_at)}</td>
                  </tr>
                ))}
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
        Vidas e valores vêm da base do BI importada pela Fortes Pay; o valor por vida é o da sua
        regra vigente em cada mês.
      </p>
    </AppShell>
  );
}
