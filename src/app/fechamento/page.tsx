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
import {
  closingStatusLabels,
  decisionLabels,
  partnerResponseLabels,
  paymentMethodLabels,
} from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import { closeClosing, prepareClosing, setClosingAdjustment } from "./actions";

export const metadata: Metadata = { title: "Fechamento do mês" };

type PageProps = { searchParams: Promise<{ competency?: string }> };

function paymentLine(item: ClosingItem): string {
  if (!item.payment_method) {
    return "meio de pagamento não informado";
  }
  const label = paymentMethodLabels[item.payment_method as keyof typeof paymentMethodLabels];
  if (item.payment_method === "pix") {
    return `${label} · ${item.pix_key ?? ""}`;
  }
  if (item.payment_method === "bank_transfer") {
    return `${label} · ${item.bank_name ?? ""} ag. ${item.bank_branch ?? ""} c/c ${item.bank_account ?? ""}`;
  }
  return label;
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
  const monthQuery = `?competency=${competency}`;
  return (
    <AppShell title="Fechamento do mês">
      <div className="fp-management-intro">
        <p>
          Da base importada à decisão de quem recebe, uma etapa por vez. Em outubro fecha-se
          setembro.
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
            {checks.previous_open
              ? ` Antes, feche ${competencyLabel(dateToCompetency(checks.previous_open))}.`
              : ""}
          </p>
          <Link className="fp-button-secondary" href="/importacoes">
            Ver importações
          </Link>
        </li>
        <li>
          <span className="fp-step-number">02</span>
          <h2>Revisar o cálculo</h2>
          <p>
            {detail
              ? `Cálculo preparado em ${formatDateTime(detail.closing.prepared_at)}. Recalcule depois de uma nova importação; os ajustes são preservados.`
              : "Prepare o cálculo: vidas pagas × valor por vida de cada parceiro ativo, mais o saldo acumulado do mês anterior."}
          </p>
          {closed ? (
            <span className="fp-step-access">Mês fechado</span>
          ) : (
            <MutationForm
              action={prepareClosing}
              label={detail ? "Recalcular" : "Preparar cálculo"}
              pendingLabel="Calculando…"
            >
              <input type="hidden" name="competency" value={competency} />
            </MutationForm>
          )}
        </li>
        <li>
          <span className="fp-step-number">03</span>
          <h2>Fechar o lote</h2>
          <p>
            {closed
              ? `Fechado em ${formatDateTime(detail?.closing.closed_at ?? "")}${detail?.closed_by_name ? ` por ${detail.closed_by_name}` : ""}. Nada mais entra neste mês.`
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
            <div className="fp-table-wrap">
              <table className="fp-table">
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
                      <td>
                        <strong>{item.partner_name}</strong>
                        <br />
                        <small className="text-muted-foreground">{paymentLine(item)}</small>
                      </td>
                      <td className="fp-num">{formatInteger(item.lives)}</td>
                      <td className="fp-num">{formatCurrency(item.month_amount)}</td>
                      <td className="fp-num">
                        {formatCurrency(item.adjustment)}
                        {item.adjustment_note ? (
                          <small className="block text-muted-foreground">
                            {item.adjustment_note}
                          </small>
                        ) : null}
                      </td>
                      <td className="fp-num">{formatCurrency(item.previous_balance)}</td>
                      <td className="fp-num">{formatCurrency(item.total)}</td>
                      <td>
                        {item.decision
                          ? decisionLabels[item.decision as keyof typeof decisionLabels]
                          : "—"}
                      </td>
                      <td>
                        {item.partner_response
                          ? `${partnerResponseLabels[item.partner_response as keyof typeof partnerResponseLabels]}${item.partner_note ? ` · ${item.partner_note}` : ""}`
                          : "—"}
                      </td>
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
          ) : (
            <>
              <div className="fp-table-wrap">
                <table className="fp-table">
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
                        <td>
                          <strong>{item.partner_name}</strong>
                          <br />
                          <small className="text-muted-foreground">{paymentLine(item)}</small>
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
                                    : String(item.adjustment).replace(".", ",")
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
                    Conferi a base, o cálculo e os meios de pagamento. Depois de fechar, nada mais
                    entra neste mês.
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
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Situação</th>
                  <th>Preparado em</th>
                  <th>Fechado em</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fp-panel-footnote">
          Cada fechamento guarda, por parceiro: valor do mês, ajuste, saldo anterior, total, pago ou
          acumulado, quando e quem decidiu. Link do mês: {monthQuery}
        </p>
      </section>
    </AppShell>
  );
}
