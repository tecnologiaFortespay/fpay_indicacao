import type { Metadata } from "next";
import Link from "next/link";
import { AiReviewPanel } from "@/components/ai-review-panel";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field, SelectField } from "@/components/fields";
import { FormDisclosure } from "@/components/form-disclosure";
import { LinkButton } from "@/components/link-button";
import { MutationForm } from "@/components/mutation-form";
import { Notice } from "@/components/notice";
import { PageIntro } from "@/components/page-intro";
import { PanelBody, SectionCard } from "@/components/section-card";
import { Stepper, type Step } from "@/components/stepper";
import { aiConfigured } from "@/lib/ai/claude";
import { latestReview } from "@/lib/ai/reviews";
import { requireRole } from "@/lib/auth/session";
import {
  closingChecks,
  getClosing,
  listClosings,
  sellerNames,
  type ClosingItem,
} from "@/lib/closings/queries";
import { formatCnpj } from "@/lib/cnpj";
import {
  competencyLabel,
  currentCompetency,
  dateToCompetency,
  formatDate,
  formatDateTime,
  isCompetency,
  previousCompetency,
} from "@/lib/competency";
import { closingStatusLabels, decisionLabels, partnerResponseLabels } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import {
  closeClosing,
  prepareClosing,
  reviewClosing,
  setClosingAdjustment,
  setPaymentNote,
} from "./actions";

export const metadata: Metadata = { title: "Fechamento do mês" };

// A análise da IA roda depois da resposta (after()) e pode levar alguns minutos na Vercel.
export const maxDuration = 300;

type PageProps = { searchParams: Promise<{ competency?: string; msg?: string }> };

function responseText(item: ClosingItem): string {
  if (!item.partner_response) {
    return "aguardando";
  }
  const label =
    partnerResponseLabels[item.partner_response as keyof typeof partnerResponseLabels] ??
    item.partner_response;
  const when = item.partner_response_at ? ` em ${formatDateTime(item.partner_response_at)}` : "";
  const note = item.partner_note ? `: ${item.partner_note}` : "";
  return `${label}${when}${note}`;
}

export default async function ClosingPage({ searchParams }: PageProps) {
  await requireRole("director");
  const params = await searchParams;
  const competency = isCompetency(params.competency) ? params.competency : previousCompetency();
  const [detail, checks, history] = await Promise.all([
    getClosing(competency),
    closingChecks(competency),
    listClosings(),
  ]);
  const monthLabel = competencyLabel(competency);
  const today = currentCompetency();
  const closed = detail?.closing.status === "closed";
  const blockerLabel = checks.blocker ? competencyLabel(checks.blocker) : null;
  const baseReady = checks.import_after_month_end !== null;
  const canPrepare = !closed && !checks.not_ended && !blockerLabel && baseReady;
  const review = detail ? await latestReview({ closing_id: detail.closing.id }) : null;
  const reviewOutdated =
    review !== null &&
    detail !== null &&
    Date.parse(detail.closing.prepared_at) > Date.parse(review.created_at);

  const steps: Step[] = [
    {
      title: "Conferir a planilha do mês",
      state:
        closed || baseReady ? "done" : checks.not_ended || blockerLabel ? "blocked" : "current",
      text: checks.not_ended
        ? `${monthLabel} ainda não terminou. Depois do último dia, envie a planilha do BI do mês inteiro.`
        : baseReady
          ? `Planilha de ${monthLabel} enviada em ${formatDateTime(checks.import_after_month_end?.created_at ?? "")}, depois do fim do mês.`
          : `Falta enviar a planilha do BI de ${monthLabel} feita depois do fim do mês. Sem ela o mês não fecha.`,
      action: !closed && !baseReady && !checks.not_ended && (
        <LinkButton href="/importacoes">Ir para Importações</LinkButton>
      ),
    },
    {
      title: "Preparar e revisar o cálculo",
      state: closed ? "done" : canPrepare ? (detail ? "done" : "current") : "blocked",
      text: closed
        ? "Cálculo conferido."
        : blockerLabel
          ? `Feche ${blockerLabel} primeiro: os meses fecham em ordem.`
          : checks.not_ended
            ? "Abre no primeiro dia do mês seguinte."
            : !baseReady
              ? "Abre depois do envio da planilha do mês inteiro."
              : detail
                ? `Preparado em ${formatDateTime(detail.closing.prepared_at)}. Se enviar uma planilha nova do mês, recalcule; os ajustes são mantidos.`
                : "Calcula, por parceiro ativo: vidas pagas × valor por vida, mais o saldo acumulado do mês anterior.",
      action: blockerLabel ? (
        <LinkButton href={`/fechamento?competency=${checks.blocker}`}>
          Ir para {blockerLabel}
        </LinkButton>
      ) : canPrepare ? (
        <MutationForm
          action={prepareClosing}
          label={detail ? "Recalcular" : "Preparar cálculo"}
          pendingLabel="Calculando…"
          variant={detail ? "outline" : "default"}
        >
          <input type="hidden" name="competency" value={competency} />
        </MutationForm>
      ) : null,
    },
    {
      title: "Fechar o lote",
      state: closed ? "done" : detail ? "current" : "upcoming",
      text: closed
        ? `Fechado em ${formatDateTime(detail?.closing.closed_at ?? "")}${detail?.closing.closed_by_name ? ` por ${detail.closing.closed_by_name}` : ""}. Nada mais entra neste mês.`
        : detail
          ? "Marque abaixo quem recebe agora. Quem não for marcado acumula para o mês seguinte."
          : "Depois de preparar o cálculo.",
      action: detail && !closed && (
        <a href="#fechar-lote" className="text-sm font-medium text-primary underline">
          Ir para o fechamento do lote ↓
        </a>
      ),
    },
  ];

  return (
    <AppShell title="Fechamento do mês" flash={params.msg}>
      <PageIntro month={{ value: competency, label: "Mês do fechamento" }}>
        Hoje é {competencyLabel(today)}: meses que já terminaram podem ser fechados, um de cada vez
        e em ordem. Fechar é decidir quem recebe o valor do mês e quem acumula para o seguinte.
      </PageIntro>

      <Stepper steps={steps} label={`Etapas do fechamento de ${monthLabel}`} />

      {detail && (
        <SectionCard
          title={`${monthLabel} · ${closingStatusLabels[detail.closing.status as keyof typeof closingStatusLabels]}`}
          subtitle={
            closed
              ? `Pago: ${formatCurrency(detail.totals.to_pay)} · acumulado para o mês seguinte: ${formatCurrency(detail.totals.total - detail.totals.to_pay)}`
              : `${detail.items.length} parceiro(s) ativo(s). Confira os valores antes de fechar.`
          }
          footnote={
            closed
              ? undefined
              : "Valor por vida é a regra do parceiro para indicações novas no mês; cada indicação entra no valor do mês com a regra dela (a de quando foi feita, ou a própria). Ver clientes mostra uma a uma. Saldo anterior é o que ficou acumulado no mês passado."
          }
        >
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th>Vendedor(es)</th>
                  <th className="fp-num">Vidas</th>
                  {!closed && <th className="fp-num">Valor por vida</th>}
                  <th className="fp-num">Valor do mês</th>
                  <th className="fp-num">Ajuste</th>
                  <th className="fp-num">Saldo anterior</th>
                  <th className="fp-num">Total</th>
                  {closed && <th>Decisão</th>}
                  {closed && <th>Resposta do parceiro</th>}
                </tr>
              </thead>
              <tbody>
                {detail.items.flatMap((item) => [
                  <tr key={item.id}>
                    <td>
                      <strong>{item.partner_name}</strong>
                    </td>
                    <td>{sellerNames(item).join(", ") || "—"}</td>
                    <td className="fp-num">{formatInteger(item.lives)}</td>
                    {!closed && (
                      <td className="fp-num">
                        {item.value_per_life === null
                          ? item.lives > 0
                            ? "sem regra"
                            : "—"
                          : formatCurrency(item.value_per_life)}
                      </td>
                    )}
                    <td className="fp-num">{formatCurrency(item.month_amount)}</td>
                    <td className="fp-num">
                      {formatCurrency(item.adjustment)}
                      {item.adjustment_note && <small>{item.adjustment_note}</small>}
                    </td>
                    <td className="fp-num">{formatCurrency(item.previous_balance)}</td>
                    <td className="fp-num">
                      <strong>{formatCurrency(item.total)}</strong>
                    </td>
                    {closed && (
                      <td>
                        {item.decision
                          ? decisionLabels[item.decision as keyof typeof decisionLabels]
                          : "Sem valor"}
                        {item.decided_at && <small>{formatDateTime(item.decided_at)}</small>}
                        {item.decided_by_name && <small>{item.decided_by_name}</small>}
                      </td>
                    )}
                    {closed && <td>{responseText(item)}</td>}
                  </tr>,
                  // Item 2 (decisão 22): os clientes do mês como gravados no fechamento; a soma
                  // é o valor do parceiro. Linha omitida quando o parceiro não teve cliente no mês.
                  item.clients.length === 0 ? null : (
                    <tr key={`${item.id}-clients`} className="fp-row-clients">
                      <td colSpan={closed ? 9 : 8}>
                        <details className="fp-disclosure">
                          <summary>
                            Ver clientes de {item.partner_name} ({item.clients.length})
                          </summary>
                          <div className="fp-table-wrap">
                            <table className="fp-table">
                              <thead>
                                <tr>
                                  <th>Empresa</th>
                                  <th>CNPJ</th>
                                  <th>Vendedor</th>
                                  <th className="fp-num">Vidas</th>
                                  <th className="fp-num">Valor por vida</th>
                                  <th className="fp-num">Valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.clients.map((client) => (
                                  <tr key={client.referral_id}>
                                    <td>{client.company_name}</td>
                                    <td className="fp-num">{formatCnpj(client.cnpj)}</td>
                                    <td>{client.seller_name || "—"}</td>
                                    <td className="fp-num">{formatInteger(client.lives)}</td>
                                    <td className="fp-num">
                                      {client.value_per_life === null
                                        ? "sem regra"
                                        : formatCurrency(client.value_per_life)}
                                    </td>
                                    <td className="fp-num">{formatCurrency(client.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ),
                ])}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td />
                  {!closed && <td />}
                  <td className="fp-num">{formatCurrency(detail.totals.month_amount)}</td>
                  <td className="fp-num">{formatCurrency(detail.totals.adjustment)}</td>
                  <td className="fp-num">{formatCurrency(detail.totals.previous_balance)}</td>
                  <td className="fp-num">{formatCurrency(detail.totals.total)}</td>
                  {closed && <td colSpan={2}>Pago: {formatCurrency(detail.totals.to_pay)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>

          {!closed && detail.items.length > 0 && (
            <FormDisclosure
              label="Ajustar o valor de um parceiro"
              description="Use para descontos ou acréscimos combinados. O ajuste soma (ou subtrai, com sinal de menos) no total e fica registrado com o motivo. Para tirar um ajuste, salve 0."
            >
              <MutationForm action={setClosingAdjustment} label="Salvar ajuste">
                <div className="fp-form-grid fp-form-grid-3">
                  <SelectField
                    label="Parceiro"
                    name="id"
                    required
                    options={[
                      ["", "Selecione"],
                      ...detail.items.map(
                        (item) =>
                          [
                            item.id,
                            `${item.partner_name} · total ${formatCurrency(item.total)}`,
                          ] as [string, string],
                      ),
                    ]}
                  />
                  <Field
                    label="Ajuste (R$)"
                    name="amount"
                    required
                    placeholder="-10,00"
                    inputMode="decimal"
                    hint="Negativo para desconto, positivo para acréscimo."
                  />
                  <Field
                    label="Motivo do ajuste"
                    name="note"
                    maxLength={400}
                    hint="O parceiro vê este motivo no fechamento."
                  />
                </div>
              </MutationForm>
            </FormDisclosure>
          )}

          {closed && detail.items.some((item) => item.decision === "pay") && (
            <div className="fp-form-section">
              <h3>Como foi pago</h3>
              <p className="fp-help">
                Anote como a Fortes Pay pagou cada parceiro (ex.: PIX em 05/11). O parceiro vê em
                Meus fechamentos.
              </p>
              <div className="space-y-4">
                {detail.items
                  .filter((item) => item.decision === "pay")
                  .map((item) => (
                    <MutationForm
                      key={item.id}
                      action={setPaymentNote}
                      label="Salvar"
                      pendingLabel="Salvando…"
                      variant="outline"
                      resetOnSuccess={false}
                    >
                      <input type="hidden" name="id" value={item.id} />
                      <Field
                        label={`Como foi pago a ${item.partner_name} (${formatCurrency(item.total)})`}
                        name="payment_note"
                        maxLength={200}
                        placeholder="PIX em 05/11"
                        defaultValue={item.payment_note ?? ""}
                      />
                    </MutationForm>
                  ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {detail && !closed && (
        <SectionCard
          id="fechar-lote"
          title={`Fechar o lote de ${monthLabel}`}
          subtitle="Marque quem recebe agora. Quem não for marcado acumula: o total entra como saldo anterior no mês seguinte."
        >
          <PanelBody>
            <MutationForm action={closeClosing} label="Fechar lote" pendingLabel="Fechando…">
              <input type="hidden" name="closing_id" value={detail.closing.id} />
              <input type="hidden" name="competency" value={competency} />
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">Quem recebe agora</legend>
                {detail.items.map((item) => (
                  <label key={item.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="pay"
                      value={item.partner_id}
                      disabled={Number(item.total) <= 0}
                    />
                    <span>
                      {item.partner_name} · {formatCurrency(item.total)}
                      {Number(item.total) <= 0 ? " (nada a pagar)" : ""}
                    </span>
                  </label>
                ))}
              </fieldset>
              <Notice tone="warning" compact>
                Depois de fechar, nada mais entra neste mês: planilhas novas de {monthLabel} são
                ignoradas e os valores ficam como estão.
              </Notice>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input type="checkbox" name="confirmation" />
                Conferi a base e o cálculo. Depois de fechar, nada mais entra neste mês.
              </label>
            </MutationForm>
          </PanelBody>
        </SectionCard>
      )}

      {detail && (!closed || review) && (
        <AiReviewPanel
          title="Revisão da IA"
          description="Antes de fechar, a IA confere o cálculo de cada parceiro contra o mês anterior e aponta o que merece atenção: valores que mudaram muito, indicação ativa sem vidas, saldo acumulado há meses, ajuste sem motivo e prazos terminando. Quem decide pagar ou acumular é você."
          review={review}
          configured={aiConfigured()}
          canRequest={!closed}
          action={reviewClosing}
          fields={{ competency, closing_id: detail.closing.id }}
          notice={
            reviewOutdated
              ? "O cálculo foi refeito depois desta revisão. Peça de novo para revisar os valores atuais."
              : null
          }
        />
      )}

      <SectionCard
        title="Fechamentos registrados"
        subtitle="Cada fechamento guarda, por parceiro, o valor do mês, o ajuste, o saldo anterior, o total, a decisão, quem decidiu e como foi pago."
      >
        {history.length === 0 ? (
          <EmptyState title="Nenhum fechamento preparado ainda" />
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Situação</th>
                  <th>Preparado em</th>
                  <th>Fechado em</th>
                  <th>Fechado por</th>
                </tr>
              </thead>
              <tbody>
                {history.map((closing) => (
                  <tr key={closing.id}>
                    <td>
                      <Link href={`/fechamento?competency=${dateToCompetency(closing.competency)}`}>
                        {competencyLabel(dateToCompetency(closing.competency))}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={
                          closing.status === "closed"
                            ? "fp-status fp-status-success"
                            : "fp-status fp-status-pending"
                        }
                      >
                        {closingStatusLabels[closing.status as keyof typeof closingStatusLabels]}
                      </span>
                    </td>
                    <td>{formatDate(closing.prepared_at)}</td>
                    <td>{closing.closed_at ? formatDate(closing.closed_at) : "—"}</td>
                    <td>{closing.closed_by_name ?? "—"}</td>
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
