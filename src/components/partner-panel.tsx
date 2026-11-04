import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { PageIntro } from "@/components/page-intro";
import { PanelBody, SectionCard } from "@/components/section-card";
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
import { partnerDecisionLabels, partnerResponseLabels, type ReferralStatus } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import {
  lastImportAt,
  partnerClosingItems,
  partnerMonthSummary,
  pendingBalanceOf,
  type PartnerClosingItem,
} from "@/lib/partner-panel/queries";
import { ruleInForce } from "@/lib/partners/queries";
import { termLabel } from "@/lib/referrals/config";
import { listReferrals, referralMonthValues, type ReferralRow } from "@/lib/referrals/queries";
import { partnerStatusNames, referralStage, statusChipClass } from "@/lib/referrals/stages";

type PartnerPanelProps = {
  user: AuthorizedUser;
  requestedCompetency?: string;
};

// Clientes que aparecem no mês: os que tiveram vidas contando nele, mais os que já rendiam e
// ficaram sem pagamento (aparecem com 0 para o parceiro cobrar).
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

function decisionText(item: PartnerClosingItem): string {
  if (!item.decision) {
    return "Sem valor a pagar";
  }
  return partnerDecisionLabels[item.decision as keyof typeof partnerDecisionLabels];
}

function responseText(item: PartnerClosingItem): string {
  if (!item.partner_response) {
    return "aguardando sua confirmação";
  }
  return partnerResponseLabels[item.partner_response as keyof typeof partnerResponseLabels];
}

// Painel do parceiro: o mês escolhido (prévia ou valor oficial), os meses fechados e as indicações
// por etapa. Tudo sob a RLS dele.
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
  const counts = { earning: 0, not_earning: 0, closed: 0 };
  for (const referral of referrals) {
    counts[referralStage(referral.status)] += 1;
  }
  const ruleText = rule
    ? `${formatCurrency(rule.value_per_life)} por vida · ${rule.term_months === null ? "sem prazo" : `prazo de ${rule.term_months} meses`}`
    : "sem regra neste mês";
  return (
    <AppShell title="Meu painel">
      <PageIntro month={{ value: competency }}>
        Olá, {partnerName}. Aqui você acompanha quanto as suas indicações rendem e o que a Fortes
        Pay já fechou.
      </PageIntro>

      <Notice tone="info" title="Como funciona">
        <ol>
          <li>
            Você indica uma empresa. Enquanto a Fortes Pay negocia, a indicação ainda não rende.
          </li>
          <li>
            Quando a empresa começa a pagar a Fortes Pay, a indicação passa a render: vidas pagas no
            mês × valor por vida.
          </li>
          <li>
            Depois que o mês termina, a Fortes Pay fecha o mês e decide pagar ou acumular para o mês
            seguinte. O valor oficial fica em Meus fechamentos.
          </li>
        </ol>
      </Notice>

      {closedMonth ? (
        <SectionCard
          title={`${monthLabel} · valor oficial`}
          subtitle={`Fechado pela Fortes Pay${closedMonth.closed_at ? ` em ${formatDate(closedMonth.closed_at)}` : ""}.`}
          action={<Link href="/fechamentos">Ver em Meus fechamentos →</Link>}
        >
          <PanelBody>
            <div className="fp-kpi-grid fp-kpi-grid-2">
              <article className="fp-kpi">
                <div className="fp-kpi-heading">
                  <h3>Valor do mês</h3>
                  <span>{formatInteger(closedMonth.lives)} vidas pagas</span>
                </div>
                <p className="fp-kpi-value fp-num">{formatCurrency(closedMonth.month_amount)}</p>
                <p className="fp-kpi-description">
                  {Number(closedMonth.adjustment) !== 0
                    ? `Ajuste de ${formatCurrency(closedMonth.adjustment)}${closedMonth.adjustment_note ? `: ${closedMonth.adjustment_note}` : ""}.`
                    : "Sem ajuste."}{" "}
                  Saldo que vinha de antes: {formatCurrency(closedMonth.previous_balance)}.
                </p>
              </article>
              <article className="fp-kpi fp-kpi-hero">
                <div className="fp-kpi-heading">
                  <h3>Total do fechamento</h3>
                  <span>{decisionText(closedMonth)}</span>
                </div>
                <p className="fp-kpi-value fp-num">{formatCurrency(closedMonth.total)}</p>
                <p className="fp-kpi-description">
                  {closedMonth.decision === "pay"
                    ? `A Fortes Pay paga este valor${closedMonth.payment_note ? ` (${closedMonth.payment_note})` : ""}.`
                    : closedMonth.decision === "accumulate"
                      ? "Este valor ficou para o próximo fechamento."
                      : "Não houve valor a pagar neste mês."}{" "}
                  Sua resposta: {responseText(closedMonth)}.
                </p>
              </article>
            </div>
          </PanelBody>
        </SectionCard>
      ) : (
        <SectionCard
          title={`${monthLabel} · prévia`}
          subtitle={`Sua regra no mês: ${ruleText}.`}
          footnote={
            <>
              Prévia com a base do BI de{" "}
              <strong>{updatedAt ? formatDateTime(updatedAt) : "—"}</strong>. A Fortes Pay atualiza
              a base várias vezes por semana; o valor oficial sai no fechamento, depois que o mês
              termina.
            </>
          }
        >
          <PanelBody>
            <div className="fp-kpi-grid fp-kpi-grid-2">
              <article className="fp-kpi">
                <div className="fp-kpi-heading">
                  <h3>Vidas pagas</h3>
                  <span>
                    {isCurrentMonth ? `até o dia ${currentDayOfMonth()}` : "no mês inteiro"}
                  </span>
                </div>
                <p className="fp-kpi-value fp-num">{formatInteger(summary.lives)}</p>
                <p className="fp-kpi-description">
                  Vidas dos seus clientes que pagaram a Fortes Pay neste mês.
                </p>
              </article>
              <article className="fp-kpi fp-kpi-preview">
                <div className="fp-kpi-heading">
                  <h3>Valor previsto</h3>
                  <span>prévia</span>
                </div>
                <p className="fp-kpi-value fp-num">{formatCurrency(summary.amount)}</p>
                <p className="fp-kpi-description">
                  Vidas × valor por vida de cada indicação. Pode mudar até o fechamento.
                </p>
              </article>
            </div>
          </PanelBody>
        </SectionCard>
      )}

      <SectionCard
        title="Meses fechados (valor oficial)"
        action={<Link href="/fechamentos">Ver todos →</Link>}
      >
        {latestClosing ? (
          <PanelBody>
            <div className="fp-kpi-grid fp-kpi-grid-2">
              <article className="fp-kpi">
                <div className="fp-kpi-heading">
                  <h3>Saldo acumulado a receber</h3>
                  <span>depois de {competencyLabel(latestClosing.competency)}</span>
                </div>
                <p className="fp-kpi-value fp-num">{formatCurrency(pending)}</p>
                <p className="fp-kpi-description">
                  Valor que ficou para o próximo fechamento. Zero quando o último mês foi pago.
                </p>
              </article>
              <article className="fp-kpi">
                <div className="fp-kpi-heading">
                  <h3>Último fechamento</h3>
                  <span>{competencyLabel(latestClosing.competency)}</span>
                </div>
                <p className="fp-kpi-value fp-num">{formatCurrency(latestClosing.total)}</p>
                <p className="fp-kpi-description">
                  {decisionText(latestClosing)} · {responseText(latestClosing)}
                </p>
              </article>
            </div>
            {!latestClosing.partner_response && (
              <Notice tone="warning" compact>
                Confira o valor de {competencyLabel(latestClosing.competency)} e responda em{" "}
                <Link href="/fechamentos" className="underline">
                  Meus fechamentos
                </Link>
                .
              </Notice>
            )}
          </PanelBody>
        ) : (
          <EmptyState title="Nenhum mês fechado ainda">
            Quando a Fortes Pay fechar o primeiro mês, o valor oficial aparece aqui para você
            confirmar.
          </EmptyState>
        )}
      </SectionCard>

      <SectionCard
        title="Minhas indicações"
        subtitle={`Clientes que rendem em ${monthLabel}.`}
        action={<Link href="/indicacoes">Ver todas →</Link>}
        footnote={
          delinquent.length > 0
            ? `${delinquent.length} cliente(s) sem pagamento no último mês completo: vale uma conversa para não perder a comissão.`
            : "O valor por vida e o prazo são os da indicação, quando a Fortes Pay definiu, ou os da sua regra no mês."
        }
      >
        <div className="fp-stage-counts">
          <Link href="/indicacoes#rendendo">
            <strong className="fp-num">{counts.earning}</strong>
            <span>Rendendo comissão</span>
          </Link>
          <Link href="/indicacoes#ainda-nao-rende">
            <strong className="fp-num">{counts.not_earning}</strong>
            <span>Ainda não rende</span>
          </Link>
          <Link href="/indicacoes#encerradas">
            <strong className="fp-num">{counts.closed}</strong>
            <span>Encerradas</span>
          </Link>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={`Nenhum cliente rendendo em ${monthLabel}`}>
            Indicações que ainda não rendem aparecem em Minhas indicações, com o que falta para
            começar.
          </EmptyState>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Situação</th>
                  <th className="fp-num">Vidas no mês</th>
                  <th className="fp-num">Valor por vida</th>
                  <th className="fp-num">Valor no mês</th>
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
                      <td>
                        {referral.company_name}
                        <small className="fp-num">{formatCnpj(referral.cnpj)}</small>
                      </td>
                      <td>
                        <span className={statusChipClass(referral.status)}>
                          {partnerStatusNames[referral.status as ReferralStatus] ?? referral.status}
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
      </SectionCard>
    </AppShell>
  );
}
