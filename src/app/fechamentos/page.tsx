import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { TextAreaField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { requireRole } from "@/lib/auth/session";
import { competencyLabel, formatDate, formatDateTime } from "@/lib/competency";
import { partnerDecisionLabels, partnerResponseLabels } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import { partnerClosingItems, pendingBalanceOf } from "@/lib/partner-panel/queries";
import { respondClosingItem } from "./actions";

export const metadata: Metadata = { title: "Meus fechamentos" };

export default async function PartnerClosingsPage() {
  const user = await requireRole("partner");
  const items = await partnerClosingItems(user.profile.partner?.id ?? "");
  const pending = pendingBalanceOf(items);
  return (
    <AppShell title="Meus fechamentos">
      <div className="fp-management-intro">
        <p>
          Cada mês fechado pela Fortes Pay mostra o valor do mês, o saldo anterior e se foi pago ou
          acumulado. Saldo pendente hoje:{" "}
          <strong className="fp-num">{formatCurrency(pending)}</strong>.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="fp-empty">
          <h2>Nenhum mês fechado ainda</h2>
          <p>Quando a Fortes Pay fechar um mês, ele aparece aqui para você confirmar o valor.</p>
        </div>
      ) : (
        items.map((item) => (
          <section className="fp-panel mb-6" key={item.id}>
            <div className="fp-panel-heading">
              <h2>{competencyLabel(item.competency)}</h2>
              <span>{item.closed_at ? `fechado em ${formatDate(item.closed_at)}` : ""}</span>
            </div>
            <dl className="fp-balance-composition">
              <div>
                <dt>Vidas pagas</dt>
                <dd className="fp-num">{formatInteger(item.lives)}</dd>
              </div>
              <div>
                <dt>Valor do mês</dt>
                <dd className="fp-num">{formatCurrency(item.month_amount)}</dd>
              </div>
              {Number(item.adjustment) !== 0 && (
                <div>
                  <dt>Ajuste{item.adjustment_note ? ` · ${item.adjustment_note}` : ""}</dt>
                  <dd className="fp-num">{formatCurrency(item.adjustment)}</dd>
                </div>
              )}
              <div>
                <dt>Saldo anterior</dt>
                <dd className="fp-num">{formatCurrency(item.previous_balance)}</dd>
              </div>
              <div className="fp-balance-result">
                <dt>Total</dt>
                <dd className="fp-num">{formatCurrency(item.total)}</dd>
              </div>
              <div>
                <dt>Decisão da Fortes Pay</dt>
                <dd>
                  {item.decision
                    ? partnerDecisionLabels[item.decision as keyof typeof partnerDecisionLabels]
                    : "Sem valor a pagar"}
                </dd>
              </div>
              {item.decision === "pay" && (
                <div>
                  <dt>Como foi pago</dt>
                  <dd>{item.payment_note ?? "a Fortes Pay ainda não informou"}</dd>
                </div>
              )}
            </dl>
            {item.partner_response ? (
              <p className="fp-panel-footnote">
                {partnerResponseLabels[item.partner_response as keyof typeof partnerResponseLabels]}
                {item.partner_response_at ? ` em ${formatDateTime(item.partner_response_at)}` : ""}
                {item.partner_note ? ` · ${item.partner_note}` : ""}
              </p>
            ) : (
              <div className="fp-form-section">
                <h3>Este valor confere?</h3>
                <div className="fp-form-grid">
                  <MutationForm
                    action={respondClosingItem}
                    label="Confirmar valor"
                    pendingLabel="Confirmando…"
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="response" value="confirmed" />
                  </MutationForm>
                  <MutationForm
                    action={respondClosingItem}
                    label="Contestar"
                    pendingLabel="Enviando…"
                    variant="outline"
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="response" value="disputed" />
                    <TextAreaField
                      label={`O que não confere em ${competencyLabel(item.competency)}`}
                      name="note"
                      maxLength={400}
                      rows={2}
                    />
                  </MutationForm>
                </div>
              </div>
            )}
          </section>
        ))
      )}
    </AppShell>
  );
}
