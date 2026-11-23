import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { TextAreaField } from "@/components/fields";
import { InfoTip } from "@/components/info-tip";
import { MutationForm } from "@/components/mutation-form";
import { Notice } from "@/components/notice";
import { PageIntro } from "@/components/page-intro";
import { SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import { competencyLabel, formatDate, formatDateTime } from "@/lib/competency";
import { help } from "@/lib/help";
import { partnerDecisionLabels } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import { partnerClosingItems, pendingBalanceOf } from "@/lib/partner-panel/queries";
import { respondClosingItem } from "./actions";

export const metadata: Metadata = { title: "Meus fechamentos" };

type PageProps = { searchParams: Promise<{ msg?: string }> };

export default async function PartnerClosingsPage({ searchParams }: PageProps) {
  const user = await requireRole("partner");
  const params = await searchParams;
  const items = await partnerClosingItems(user.profile.partner?.id ?? "");
  const pending = pendingBalanceOf(items);
  return (
    <AppShell title="Meus fechamentos" flash={params.msg}>
      <PageIntro>
        Cada mês fechado pela Fortes Pay, com o valor oficial: o que rendeu no mês, o saldo que
        vinha de antes e se foi pago ou acumulado. Saldo acumulado a receber hoje:{" "}
        <strong className="fp-num">{formatCurrency(pending)}</strong>.
      </PageIntro>
      {items.length === 0 ? (
        <section className="fp-panel">
          <EmptyState title="Nenhum mês fechado ainda">
            Quando a Fortes Pay fechar um mês, ele aparece aqui para você confirmar o valor.
          </EmptyState>
        </section>
      ) : (
        items.map((item) => (
          <SectionCard
            key={item.id}
            title={competencyLabel(item.competency)}
            info={help.parceiro.fechamentos.mes}
            subtitle={item.closed_at ? `Fechado em ${formatDate(item.closed_at)}` : undefined}
          >
            <dl className="fp-balance-composition">
              <div>
                <dt>
                  Vidas pagas no mês
                  <InfoTip text={help.parceiro.fechamentos.vidas} />
                </dt>
                <dd className="fp-num">{formatInteger(item.lives)}</dd>
              </div>
              <div>
                <dt>
                  Valor do mês
                  <InfoTip text={help.parceiro.fechamentos.valorDoMes} />
                </dt>
                <dd className="fp-num">{formatCurrency(item.month_amount)}</dd>
              </div>
              {Number(item.adjustment) !== 0 && (
                <div>
                  <dt>
                    Ajuste{item.adjustment_note ? ` · ${item.adjustment_note}` : ""}
                    <InfoTip text={help.parceiro.fechamentos.ajuste} />
                  </dt>
                  <dd className="fp-num">{formatCurrency(item.adjustment)}</dd>
                </div>
              )}
              <div>
                <dt>
                  Saldo que vinha de antes
                  <InfoTip text={help.parceiro.fechamentos.saldoAnterior} />
                </dt>
                <dd className="fp-num">{formatCurrency(item.previous_balance)}</dd>
              </div>
              <div className="fp-balance-result">
                <dt>
                  Total
                  <InfoTip text={help.parceiro.fechamentos.total} />
                </dt>
                <dd className="fp-num">{formatCurrency(item.total)}</dd>
              </div>
              <div>
                <dt>
                  Decisão da Fortes Pay
                  <InfoTip text={help.parceiro.fechamentos.decisao} />
                </dt>
                <dd>
                  {item.decision
                    ? partnerDecisionLabels[item.decision as keyof typeof partnerDecisionLabels]
                    : "Sem valor a pagar"}
                </dd>
              </div>
              {item.decision === "pay" && (
                <div>
                  <dt>
                    Como foi pago
                    <InfoTip text={help.parceiro.fechamentos.comoFoiPago} />
                  </dt>
                  <dd>{item.payment_note ?? "a Fortes Pay ainda não informou"}</dd>
                </div>
              )}
            </dl>
            {item.partner_response ? (
              <div className="fp-panel-body">
                <Notice
                  tone={item.partner_response === "confirmed" ? "success" : "warning"}
                  compact
                >
                  {item.partner_response === "confirmed" ? "Você confirmou" : "Você contestou"}
                  {item.partner_response_at
                    ? ` em ${formatDateTime(item.partner_response_at)}`
                    : ""}
                  {item.partner_note ? `: ${item.partner_note}` : "."}
                </Notice>
              </div>
            ) : (
              <div className="fp-form-section">
                <div className="fp-title-row">
                  <h3>Este valor confere?</h3>
                  <InfoTip text={help.parceiro.fechamentos.confere} />
                </div>
                <p className="fp-help">
                  Confirme se está certo. Se algo não confere, conte o quê: a Fortes Pay vê a sua
                  resposta no fechamento. A resposta não pode ser mudada depois.
                </p>
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
          </SectionCard>
        ))
      )}
    </AppShell>
  );
}
