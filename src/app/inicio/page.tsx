import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PartnerPanel } from "@/components/partner-panel";
import { pendingBalances } from "@/lib/closings/queries";
import { Field } from "@/components/fields";
import { requireUser } from "@/lib/auth/session";
import {
  competencyLabel,
  currentCompetency,
  dateToCompetency,
  formatDateTime,
  isCompetency,
} from "@/lib/competency";
import { directorOverview, latestCompetency } from "@/lib/dashboard/queries";
import { latestImport } from "@/lib/imports/queries";
import { partnerKindLabels, referralStatusLabels, type ReferralStatus } from "@/lib/labels";
import { referralStatusCounts } from "@/lib/referrals/queries";
import { referralStatusClass } from "@/lib/referrals/transitions";
import { formatCurrency, formatInteger } from "@/lib/money";

export const metadata: Metadata = { title: "Visão geral" };

type PageProps = { searchParams: Promise<{ competency?: string }> };

export default async function HomePage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.profile.role === "analyst") {
    redirect("/importacoes");
  }
  const params = await searchParams;
  if (user.profile.role === "partner") {
    return <PartnerPanel user={user} requestedCompetency={params.competency} />;
  }
  const latest = await latestCompetency();
  const competency = isCompetency(params.competency)
    ? params.competency
    : (latest ?? currentCompetency());
  const [overview, last, counts, pending] = await Promise.all([
    directorOverview(competency),
    latestImport(),
    referralStatusCounts(),
    pendingBalances(),
  ]);
  const statusEntries = Object.entries(referralStatusLabels) as [ReferralStatus, string][];
  const monthLabel = competencyLabel(competency);
  return (
    <AppShell title="Visão geral">
      <div className="fp-management-intro">
        <p>Vidas pagas e valor a pagar por parceiro, calculados pela base importada do BI.</p>
        <form className="fp-month-picker">
          <Field name="competency" label="Mês" type="month" defaultValue={competency} required />
          <button className="fp-button-secondary">Consultar</button>
        </form>
      </div>
      <div className="fp-kpi-grid fp-management-kpis">
        <article className="fp-kpi fp-kpi-hero">
          <div className="fp-kpi-heading">
            <h2>Valor a pagar</h2>
            <span>{monthLabel}</span>
          </div>
          <p className="fp-kpi-value fp-num">{formatCurrency(overview.total_amount)}</p>
          <p className="fp-kpi-description">
            Soma de vidas pagas × valor por vida vigente de cada parceiro.
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
            <h2>Saldo pendente</h2>
            <span>
              {pending.competency
                ? `desde ${competencyLabel(dateToCompetency(pending.competency))}`
                : "nenhum fechamento"}
            </span>
          </div>
          <p className="fp-kpi-value fp-num">{formatCurrency(pending.total)}</p>
          <p className="fp-kpi-description">
            Acumulado de quem não foi marcado no último lote fechado; entra como saldo anterior no
            próximo.
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
              ? `Dados atualizados em ${formatDateTime(last.created_at)} por ${last.author}.`
              : "Nenhuma importação do BI ainda."}
          </p>
        </article>
      </div>
      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Parceiros · {monthLabel}</h2>
          <Link href="/parceiros">Cadastro de parceiros →</Link>
        </div>
        {overview.rows.length === 0 ? (
          <p className="fp-panel-footnote">
            Nenhum parceiro ativo. Cadastre o primeiro em Parceiros.
          </p>
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
                  <th className="fp-num">Saldo pendente</th>
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
                          ? "sem regra vigente"
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
        <p className="fp-panel-footnote">
          Conta só a indicação ativa de cada CNPJ (perdidas e canceladas ficam de fora) e respeita o
          prazo em meses. Valor por vida é a regra do parceiro no mês; indicações com valor próprio
          entram no valor do mês com o delas.
        </p>
      </section>
      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Indicações por situação</h2>
          <Link href="/indicacoes">Ver indicações →</Link>
        </div>
        <div className="fp-form-section fp-status-strip">
          {statusEntries.map(([value, label]) => (
            <Link key={value} href={`/indicacoes?status=${value}`}>
              <span className={referralStatusClass(value)}>{label}</span>
              <strong className="fp-num">{formatInteger(counts[value])}</strong>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
