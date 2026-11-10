import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { PageIntro } from "@/components/page-intro";
import { PartnerPanel } from "@/components/partner-panel";
import { SectionCard } from "@/components/section-card";
import { getClosing, pendingBalances } from "@/lib/closings/queries";
import { requireUser } from "@/lib/auth/session";
import {
  competencyLabel,
  currentCompetency,
  dateToCompetency,
  formatDate,
  formatDateTime,
  isCompetency,
} from "@/lib/competency";
import { directorOverview, latestCompetency } from "@/lib/dashboard/queries";
import { latestImport } from "@/lib/imports/queries";
import { partnerKindLabels, referralStatusLabels, type ReferralStatus } from "@/lib/labels";
import { referralStatusCounts } from "@/lib/referrals/queries";
import {
  referralStage,
  stageGroupTitles,
  stageOrder,
  statusChipClass,
} from "@/lib/referrals/stages";
import { formatCurrency, formatInteger } from "@/lib/money";

export const metadata: Metadata = { title: "Visão geral" };

type PageProps = { searchParams: Promise<{ competency?: string }> };

export default async function HomePage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = await searchParams;
  if (user.profile.role === "partner") {
    return <PartnerPanel user={user} requestedCompetency={params.competency} />;
  }
  const latest = await latestCompetency();
  const competency = isCompetency(params.competency)
    ? params.competency
    : (latest ?? currentCompetency());
  const [overview, last, counts, pending, closing] = await Promise.all([
    directorOverview(competency),
    latestImport(),
    referralStatusCounts(),
    pendingBalances(),
    getClosing(competency),
  ]);
  const statusEntries = Object.entries(referralStatusLabels) as [ReferralStatus, string][];
  const monthLabel = competencyLabel(competency);
  const closed = closing?.closing.status === "closed";
  return (
    <AppShell title="Visão geral">
      <PageIntro month={{ value: competency }}>
        Quanto cada parceiro rende no mês, pela planilha do BI. Mês em andamento é prévia; o valor
        oficial sai em Fechamento do mês, depois que o mês termina.
      </PageIntro>

      {closed && closing && (
        <Notice tone="warning" title={`${monthLabel} já foi fechado`}>
          Fechado em {formatDate(closing.closing.closed_at ?? closing.closing.prepared_at)}: o valor
          oficial é o do fechamento, {formatCurrency(closing.totals.to_pay)} pagos. Os números
          abaixo são recalculados com as regras de hoje e podem diferir.{" "}
          <Link href={`/fechamento?competency=${competency}`} className="underline">
            Ver o fechamento
          </Link>
          .
        </Notice>
      )}

      <div className="fp-kpi-grid">
        <article className="fp-kpi fp-kpi-hero">
          <div className="fp-kpi-heading">
            <h2>Valor do mês</h2>
            <span>{monthLabel}</span>
          </div>
          <p className="fp-kpi-value fp-num">{formatCurrency(overview.total_amount)}</p>
          <p className="fp-kpi-description">
            Soma, por parceiro, das vidas pagas × valor por vida de cada indicação.
          </p>
        </article>
        <article className="fp-kpi">
          <div className="fp-kpi-heading">
            <h2>Vidas pagas</h2>
            <span>{monthLabel}</span>
          </div>
          <p className="fp-kpi-value fp-num">{formatInteger(overview.total_lives)}</p>
          <p className="fp-kpi-description">Vidas de clientes indicados que pagaram no mês.</p>
        </article>
        <article className="fp-kpi">
          <div className="fp-kpi-heading">
            <h2>Saldo acumulado a pagar</h2>
            <span>
              {pending.competency
                ? `depois de ${competencyLabel(dateToCompetency(pending.competency))}`
                : "nenhum fechamento"}
            </span>
          </div>
          <p className="fp-kpi-value fp-num">{formatCurrency(pending.total)}</p>
          <p className="fp-kpi-description">
            De quem não foi marcado para receber no último mês fechado; entra como saldo anterior no
            próximo fechamento.
          </p>
        </article>
        <article className="fp-kpi">
          <div className="fp-kpi-heading">
            <h2>Parceiros com vidas</h2>
            <span>de {overview.rows.length} ativo(s)</span>
          </div>
          <p className="fp-kpi-value fp-num">{formatInteger(overview.partners_with_lives)}</p>
          <p className="fp-kpi-description">
            {last
              ? `Planilha do BI enviada em ${formatDateTime(last.created_at)} por ${last.author}.`
              : "Nenhuma planilha do BI enviada ainda."}
          </p>
        </article>
      </div>

      <SectionCard
        title={`Parceiros · ${monthLabel}`}
        subtitle="Clique num parceiro para ver a regra, as indicações e os meses."
        action={<Link href="/parceiros">Todos os parceiros →</Link>}
        footnote="Conta só as indicações que rendem (Ativas) e respeita o prazo de cada uma. Valor por vida é a regra do parceiro para indicações novas no mês; cada indicação entra no valor do mês com a regra dela (a de quando foi feita, ou a própria)."
      >
        {overview.rows.length === 0 ? (
          <EmptyState title="Nenhum parceiro ativo ainda">
            Gere um convite em Parceiros; o parceiro aparece aqui depois que você aprovar o
            cadastro.
          </EmptyState>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th>Tipo</th>
                  <th className="fp-num">Vidas pagas</th>
                  <th className="fp-num">Valor por vida</th>
                  <th className="fp-num">Valor do mês</th>
                  <th className="fp-num">Saldo acumulado</th>
                </tr>
              </thead>
              <tbody>
                {overview.rows.map((row) => (
                  <tr key={row.partner_id}>
                    <td>
                      <Link href={`/parceiros/${row.partner_id}`}>{row.name}</Link>
                    </td>
                    <td>
                      {partnerKindLabels[row.kind as keyof typeof partnerKindLabels] ?? row.kind}
                    </td>
                    <td className="fp-num">{formatInteger(row.lives)}</td>
                    <td className="fp-num">
                      {row.value_per_life !== null
                        ? formatCurrency(row.value_per_life)
                        : row.lives > 0
                          ? "sem regra"
                          : "—"}
                    </td>
                    <td className="fp-num">{formatCurrency(row.amount)}</td>
                    <td className="fp-num">
                      {formatCurrency(pending.by_partner.get(row.partner_id) ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="fp-num">{formatInteger(overview.total_lives)}</td>
                  <td />
                  <td className="fp-num">{formatCurrency(overview.total_amount)}</td>
                  <td className="fp-num">{formatCurrency(pending.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Indicações por etapa"
        subtitle="Só a etapa Rendendo comissão gera valor. Clique numa situação para ver a lista."
        action={<Link href="/indicacoes">Ver indicações →</Link>}
      >
        <div className="fp-stage-groups">
          {stageOrder.map((stage) => (
            <section key={stage}>
              <h3>{stageGroupTitles[stage]}</h3>
              <ul>
                {statusEntries
                  .filter(([value]) => referralStage(value) === stage)
                  .map(([value, label]) => (
                    <li key={value}>
                      <Link href={`/indicacoes?status=${value}`}>
                        <span className={statusChipClass(value)}>{label}</span>
                        <strong className="fp-num">{formatInteger(counts[value])}</strong>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
