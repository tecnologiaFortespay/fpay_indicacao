import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { requireRole } from "@/lib/auth/session";
import { closingChecks, getClosing, listClosings, type ClosingItem } from "@/lib/closings/queries";
import {
  competencyLabel,
  dateToCompetency,
  formatDate,
  formatDateTime,
  isCompetency,
  previousCompetency,
} from "@/lib/competency";
import { closingStatusLabels, decisionLabels, partnerResponseLabels } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import { closeClosing, prepareClosing, setClosingAdjustment, setPaymentNote } from "./actions";

export const metadata: Metadata = { title: "Fechamento do mês" };

type PageProps = { searchParams: Promise<{ competency?: string }> };

function responseText(item: ClosingItem): string {
  if (!item.partner_response) {
    return "—";
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
  const closed = detail?.closing.status === "closed";
  const blockerLabel = checks.blocker ? competencyLabel(checks.blocker) : null;
  return (
    <AppShell title="Fechamento do mês">
      <div className="fp-management-intro">
        <p>
          Da base importada à decisão de quem recebe, uma etapa por vez. Os meses fecham em ordem:
          em outubro fecha-se setembro, depois de agosto.
        </p>
        <form className="fp-month-picker">
          <Field
            name="competency"
            label="Mês do fechamento"
            type="month"
            required
            defaultValue={competency}
          />
          <button className="fp-button-secondary">Consultar</button>
        </form>
      </div>

      <ol className="fp-closing-steps" aria-label="Etapas do fechamento">
        <li>
          <span className="fp-step-number">01</span>
          <h2>Conferir a base</h2>
          <p>
            {checks.import_after_month_end
              ? `Há importação de ${monthLabel} feita em ${formatDateTime(checks.import_after_month_end.created_at)}, depois do fim do mês.`
              : `Ainda não há importação de ${monthLabel} feita depois do fim do mês. Sem ela o fechamento não é liberado.`}
            {blockerLabel && !closed ? ` Antes, feche ${blockerLabel}.` : ""}
          </p>
          <Link className="fp-button-secondary" href="/importacoes">
            Ver importações
          </Link>
        </li>
        <li>
          <span className="fp-step-number">02</span>
          <h2>Revisar o cálculo</h2>
          {closed ? (
            <>
              <p>Cálculo conferido e lote fechado.</p>
              <span className="fp-step-access">Mês fechado</span>
            </>
          ) : checks.not_ended ? (
            <>
              <p>Mês ainda não encerrado. O fechamento abre no primeiro dia do mês seguinte.</p>
              <span className="fp-step-access">Preparar cálculo bloqueado</span>
            </>
          ) : blockerLabel ? (
            <>
              <p>Feche {blockerLabel} primeiro: os meses fecham em ordem.</p>
              <Link
                className="fp-button-secondary"
                href={`/fechamento?competency=${checks.blocker}`}
              >
                Ir para {blockerLabel}
              </Link>
            </>
          ) : (
            <>
              <p>
                {detail
                  ? `Cálculo preparado em ${formatDateTime(detail.closing.prepared_at)}. Recalcule depois de uma nova importação; os ajustes são preservados.`
                  : "Prepare o cálculo: vidas pagas × valor por vida de cada indicação, por parceiro ativo, mais o saldo acumulado do mês anterior."}
              </p>
              <MutationForm
                action={prepareClosing}
                label={detail ? "Recalcular" : "Preparar cálculo"}
                pendingLabel="Calculando…"
              >
                <input type="hidden" name="competency" value={competency} />
              </MutationForm>
            </>
          )}
        </li>
        <li>
          <span className="fp-step-number">03</span>
          <h2>Fechar o lote</h2>
          <p>
            {closed
              ? `Fechado em ${formatDateTime(detail?.closing.closed_at ?? "")}${detail?.closing.closed_by_name ? ` por ${detail.closing.closed_by_name}` : ""}. Nada mais entra neste mês.`
              : "Marque quem vai ser pago. Quem não for marcado acumula e aparece no próximo mês com o saldo somado."}
          </p>
          {!closed && <span className="fp-step-access">Abaixo, na tabela</span>}
        </li>
      </ol>

      {detail && (
        <section className="fp-panel">
          <div className="fp-panel-heading">
            <h2>
              {monthLabel} ·{" "}
              {closingStatusLabels[detail.closing.status as keyof typeof closingStatusLabels]}
            </h2>
            <span>
              {closed
                ? `Total a pagar: ${formatCurrency(detail.totals.to_pay)}`
                : `${detail.items.length} parceiro(s) ativo(s)`}
            </span>
          </div>
          {closed ? (
            <>
              <div className="fp-table-wrap">
                <table className="fp-table fp-table-compact">
                  <thead>
                    <tr>
                      <th>Parceiro</th>
                      <th className="fp-num">Vidas</th>
                      <th className="fp-num">Valor do mês</th>
                      <th className="fp-num">Ajuste</th>
                      <th className="fp-num">Saldo anterior</th>
                      <th className="fp-num">Total</th>
                      <th>Decisão</th>
                      <th>Resposta do parceiro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap">
                          <strong>{item.partner_name}</strong>
                        </td>
                        <td className="fp-num">{formatInteger(item.lives)}</td>
                        <td className="fp-num">{formatCurrency(item.month_amount)}</td>
                        <td className="fp-num">
                          {formatCurrency(item.adjustment)}
                          {item.adjustment_note ? (
                            <small className="block max-w-48 whitespace-normal text-muted-foreground">
                              {item.adjustment_note}
                            </small>
                          ) : null}
                        </td>
                        <td className="fp-num">{formatCurrency(item.previous_balance)}</td>
                        <td className="fp-num">{formatCurrency(item.total)}</td>
                        <td className="whitespace-nowrap">
                          {item.decision
                            ? decisionLabels[item.decision as keyof typeof decisionLabels]
                            : "—"}
                          {item.decided_at ? (
                            <small className="block text-muted-foreground">
                              {formatDateTime(item.decided_at)}
                            </small>
                          ) : null}
                          {item.decided_by_name ? (
                            <small className="block text-muted-foreground">
                              {item.decided_by_name}
                            </small>
                          ) : null}
                        </td>
                        <td className="min-w-40">{responseText(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td />
                      <td className="fp-num">{formatCurrency(detail.totals.month_amount)}</td>
                      <td className="fp-num">{formatCurrency(detail.totals.adjustment)}</td>
                      <td className="fp-num">{formatCurrency(detail.totals.previous_balance)}</td>
                      <td className="fp-num">{formatCurrency(detail.totals.total)}</td>
                      <td colSpan={2}>Pago: {formatCurrency(detail.totals.to_pay)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {detail.items.some((item) => item.decision === "pay") && (
                <div className="fp-form-section">
                  <h3>Como foi pago</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Anote como a Fortes Pay pagou cada parceiro (ex.: PIX em 05/11). O parceiro vê
                    em Meus fechamentos.
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
            </>
          ) : (
            <>
              <div className="fp-table-wrap">
                <table className="fp-table fp-table-compact">
                  <thead>
                    <tr>
                      <th>Parceiro</th>
                      <th className="fp-num">Vidas</th>
                      <th className="fp-num">Valor por vida</th>
                      <th className="fp-num">Valor do mês</th>
                      <th>Ajuste</th>
                      <th className="fp-num">Saldo anterior</th>
                      <th className="fp-num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap">
                          <strong>{item.partner_name}</strong>
                        </td>
                        <td className="fp-num">{formatInteger(item.lives)}</td>
                        <td className="fp-num">
                          {item.value_per_life === null
                            ? item.lives > 0
                              ? "sem regra vigente"
                              : "—"
                            : formatCurrency(item.value_per_life)}
                        </td>
                        <td className="fp-num">{formatCurrency(item.month_amount)}</td>
                        <td>
                          <MutationForm
                            action={setClosingAdjustment}
                            label="Salvar ajuste"
                            pendingLabel="Salvando…"
                            variant="outline"
                          >
                            <input type="hidden" name="id" value={item.id} />
                            <div className="fp-inline-form">
                              <Field
                                label={`Ajuste de ${item.partner_name} (R$)`}
                                name="amount"
                                defaultValue={
                                  Number(item.adjustment) === 0
                                    ? ""
                                    : Number(item.adjustment).toFixed(2).replace(".", ",")
                                }
                                placeholder="-10,00"
                                inputMode="decimal"
                              />
                              <Field
                                label={`Motivo do ajuste de ${item.partner_name}`}
                                name="note"
                                defaultValue={item.adjustment_note ?? ""}
                                maxLength={400}
                              />
                            </div>
                          </MutationForm>
                        </td>
                        <td className="fp-num">{formatCurrency(item.previous_balance)}</td>
                        <td className="fp-num">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td />
                      <td />
                      <td className="fp-num">{formatCurrency(detail.totals.month_amount)}</td>
                      <td className="fp-num">{formatCurrency(detail.totals.adjustment)}</td>
                      <td className="fp-num">{formatCurrency(detail.totals.previous_balance)}</td>
                      <td className="fp-num">{formatCurrency(detail.totals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="fp-panel-footnote">
                Valor por vida é a regra do parceiro no mês; indicações com valor próprio entram no
                valor do mês com o delas.
              </p>
              <div className="fp-form-section">
                <h3>Fechar o lote de {monthLabel}</h3>
                <MutationForm action={closeClosing} label="Fechar lote" pendingLabel="Fechando…">
                  <input type="hidden" name="closing_id" value={detail.closing.id} />
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Marque quem vai ser pago agora</legend>
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
                  <label className="flex items-center gap-3 text-sm font-medium">
                    <input type="checkbox" name="confirmation" />
                    Conferi a base e o cálculo. Depois de fechar, nada mais entra neste mês.
                  </label>
                </MutationForm>
              </div>
            </>
          )}
        </section>
      )}

      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Fechamentos registrados</h2>
          <span>{history.length} mês(es)</span>
        </div>
        {history.length === 0 ? (
          <p className="fp-panel-footnote">Nenhum fechamento preparado ainda.</p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table fp-table-compact">
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
        <p className="fp-panel-footnote">
          Cada fechamento guarda, por parceiro: valor do mês, ajuste, saldo anterior, total, pago ou
          acumulado, quando e quem decidiu, e como foi pago.
        </p>
      </section>
    </AppShell>
  );
}
