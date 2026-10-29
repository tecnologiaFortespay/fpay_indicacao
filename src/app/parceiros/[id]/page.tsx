import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { ApprovalForm, RejectionForm } from "@/components/approval-form";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { PartnerForm } from "@/components/partner-form";
import { requireRole } from "@/lib/auth/session";
import { lastClosedCompetency } from "@/lib/closings/queries";
import { formatCnpj } from "@/lib/cnpj";
import { competencyLabel, currentCompetency, dateToCompetency, formatDate } from "@/lib/competency";
import { partnerKindLabels, partnerStatusLabels, referralStatusLabels } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import {
  getPartner,
  listPartnerMonthAmounts,
  listPartnerReferrals,
  listPartnerRules,
  type Partner,
  type PartnerRule,
} from "@/lib/partners/queries";
import { referralConfigLabel } from "@/lib/referrals/config";
import { createReferral, deletePartnerRule, savePartnerRule } from "../actions";

export const metadata: Metadata = { title: "Parceiro" };

type PageProps = { params: Promise<{ id: string }> };

function placeOf(partner: Partner): string {
  if (!partner.city) {
    return "—";
  }
  return partner.state ? `${partner.city}/${partner.state}` : partner.city;
}

function PendingPartner({
  partner,
  kind,
  status,
}: {
  partner: Partner;
  kind: string;
  status: string;
}) {
  const contact = [partner.contact_email, partner.contact_phone].filter(Boolean).join(" · ") || "—";
  return (
    <AppShell title={partner.name}>
      <Link href="/parceiros" className="fp-detail-back">
        ← Parceiros
      </Link>
      <div className="fp-detail-total">
        <div>
          <span>Situação</span>
          <strong className="text-base">{status}</strong>
        </div>
        <div>
          <span>Tipo</span>
          <strong className="text-base">{kind}</strong>
        </div>
        <div>
          <span>Local</span>
          <strong className="text-base">{placeOf(partner)}</strong>
        </div>
        <div>
          <span>Responsável</span>
          <strong className="text-base">{partner.contact_name ?? "—"}</strong>
        </div>
        <div>
          <span>Contato</span>
          <strong className="text-base">{contact}</strong>
        </div>
        <div>
          <span>Cadastrado em</span>
          <strong className="text-base">{formatDate(partner.created_at)}</strong>
        </div>
      </div>
      {partner.status === "rejected" && partner.rejection_reason && (
        <p className="orbita-alert mb-6">Recusado: {partner.rejection_reason}</p>
      )}
      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Aprovar cadastro</h2>
          <span>a regra do parceiro é obrigatória para liberar o acesso</span>
        </div>
        <div className="fp-form-section">
          <ApprovalForm partner={partner} />
        </div>
      </section>
      {partner.status === "pending" && (
        <section className="fp-panel mt-6">
          <div className="fp-panel-heading">
            <h2>Recusar cadastro</h2>
            <span>o parceiro continua sem acesso e vê o motivo</span>
          </div>
          <div className="fp-form-section">
            <RejectionForm partner={partner} />
          </div>
        </section>
      )}
    </AppShell>
  );
}

// Só a vigência mais recente muda, e só enquanto nenhum mês fechado a usa; as anteriores são histórico.
function RuleActions({ rule, partnerId }: { rule: PartnerRule; partnerId: string }) {
  return (
    <details className="fp-disclosure">
      <summary>Editar</summary>
      <MutationForm action={savePartnerRule} label="Salvar alteração">
        <input type="hidden" name="id" value={rule.id} />
        <input type="hidden" name="partner_id" value={partnerId} />
        <div className="fp-form-grid">
          <Field
            label="Valor por vida da vigência (R$)"
            name="value_per_life"
            required
            inputMode="decimal"
            defaultValue={String(rule.value_per_life).replace(".", ",")}
          />
          <Field
            label="Início da vigência"
            name="valid_from"
            type="month"
            required
            defaultValue={dateToCompetency(rule.valid_from)}
          />
          <Field
            label="Prazo da vigência em meses"
            name="term_months"
            type="number"
            min={1}
            max={120}
            defaultValue={rule.term_months === null ? "" : String(rule.term_months)}
          />
        </div>
      </MutationForm>
      <MutationForm
        action={deletePartnerRule}
        label="Remover vigência"
        pendingLabel="Removendo…"
        variant="outline"
      >
        <input type="hidden" name="id" value={rule.id} />
        <input type="hidden" name="partner_id" value={partnerId} />
      </MutationForm>
    </details>
  );
}

export default async function PartnerDetailPage({ params }: PageProps) {
  await requireRole("director");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    redirect("/parceiros");
  }
  const partner = await getPartner(id);
  if (!partner) {
    notFound();
  }
  const kind = partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind;
  const status =
    partnerStatusLabels[partner.status as keyof typeof partnerStatusLabels] ?? partner.status;
  if (partner.status !== "active") {
    return <PendingPartner partner={partner} kind={kind} status={status} />;
  }
  const [rules, referrals, amounts, lockedThrough] = await Promise.all([
    listPartnerRules(id),
    listPartnerReferrals(id),
    listPartnerMonthAmounts(id),
    lastClosedCompetency(),
  ]);
  const latest = rules[0];
  const latestEditable =
    latest !== undefined &&
    (lockedThrough === null || dateToCompetency(latest.valid_from) > lockedThrough);
  return (
    <AppShell title={partner.name}>
      <Link href="/parceiros" className="fp-detail-back">
        ← Parceiros
      </Link>
      <div className="fp-detail-total">
        <div>
          <span>Tipo</span>
          <strong className="text-base">{kind}</strong>
        </div>
        <div>
          <span>Situação</span>
          <strong className="text-base">{status}</strong>
        </div>
        <div>
          <span>Local</span>
          <strong className="text-base">{placeOf(partner)}</strong>
        </div>
        <div>
          <span>Aprovado em</span>
          <strong className="text-base">
            {partner.approved_at ? formatDate(partner.approved_at) : "—"}
          </strong>
        </div>
      </div>

      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Regras de remuneração</h2>
          <span>configuração do parceiro: vale para as indicações sem configuração própria</span>
        </div>
        {rules.length === 0 ? (
          <p className="fp-panel-footnote">
            Sem regra cadastrada: as vidas deste parceiro aparecem com valor zero até existir uma
            vigência.
          </p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Vigência a partir de</th>
                  <th className="fp-num">Valor por vida</th>
                  <th className="fp-num">Prazo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{competencyLabel(dateToCompetency(rule.valid_from))}</td>
                    <td className="fp-num">{formatCurrency(rule.value_per_life)}</td>
                    <td className="fp-num">
                      {rule.term_months === null ? "sem prazo" : `${rule.term_months} meses`}
                    </td>
                    <td>
                      {rule.id === latest?.id && latestEditable ? (
                        <RuleActions rule={rule} partnerId={partner.id} />
                      ) : (
                        <small className="text-muted-foreground">histórico</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fp-panel-footnote">
          Uma vigência nova vale do mês dela em diante. Só a mais recente pode ser editada, e só
          enquanto nenhum mês fechado a usa.
        </p>
        <div className="fp-form-section">
          <h3>Nova vigência</h3>
          <MutationForm action={savePartnerRule} label="Salvar regra">
            <input type="hidden" name="partner_id" value={partner.id} />
            <div className="fp-form-grid">
              <Field
                label="Valor por vida (R$)"
                name="value_per_life"
                required
                placeholder="1,50"
                inputMode="decimal"
              />
              <Field
                label="Vigência a partir de"
                name="valid_from"
                type="month"
                required
                defaultValue={currentCompetency()}
              />
              <Field
                label="Prazo em meses"
                name="term_months"
                type="number"
                min={1}
                max={120}
                hint="Em branco = sem prazo. Com prazo, cada indicação conta só os primeiros N meses após o primeiro pagamento."
              />
            </div>
          </MutationForm>
        </div>
      </section>

      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Indicações</h2>
          <span>{referrals.length} indicação(ões)</span>
        </div>
        {referrals.length === 0 ? (
          <p className="fp-panel-footnote">Nenhuma indicação registrada para este parceiro.</p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Situação</th>
                  <th>1º mês pago</th>
                  <th>Valor e prazo</th>
                  <th className="fp-num">Vidas estimadas</th>
                  <th>Indicada em</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>
                      <Link href={`/indicacoes/${referral.id}`}>{referral.company_name}</Link>
                    </td>
                    <td className="fp-num">{formatCnpj(referral.cnpj)}</td>
                    <td>
                      {referralStatusLabels[referral.status as keyof typeof referralStatusLabels] ??
                        referral.status}
                    </td>
                    <td>
                      {referral.activated_competency
                        ? competencyLabel(dateToCompetency(referral.activated_competency))
                        : "—"}
                    </td>
                    <td>{referralConfigLabel(referral.value_per_life, referral.term_months)}</td>
                    <td className="fp-num">
                      {referral.estimated_lives === null
                        ? "—"
                        : formatInteger(referral.estimated_lives)}
                    </td>
                    <td>{formatDate(referral.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="fp-form-section">
          <h3>Registrar indicação em nome do parceiro</h3>
          <MutationForm action={createReferral} label="Registrar indicação">
            <input type="hidden" name="partner_id" value={partner.id} />
            <div className="fp-form-grid">
              <Field
                label="CNPJ do cliente"
                name="cnpj"
                required
                maxLength={18}
                placeholder="00.000.000/0000-00"
              />
              <Field label="Empresa" name="company_name" required maxLength={240} />
              <Field label="Vidas estimadas" name="estimated_lives" type="number" min={0} />
              <Field
                label="Valor por vida da indicação (R$)"
                name="value_per_life"
                inputMode="decimal"
                hint="Em branco = regra do parceiro."
              />
              <Field
                label="Prazo da indicação em meses"
                name="term_months"
                type="number"
                min={1}
                max={120}
                hint="Em branco = regra do parceiro."
              />
            </div>
          </MutationForm>
        </div>
      </section>

      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Vidas e valores por mês</h2>
          <span>últimos 12 meses com dados</span>
        </div>
        {amounts.length === 0 ? (
          <p className="fp-panel-footnote">
            Nenhuma vida paga encontrada nas importações para as indicações deste parceiro.
          </p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="fp-num">Vidas pagas</th>
                  <th className="fp-num">Valor por vida da regra</th>
                  <th className="fp-num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {amounts.map((row) => (
                  <tr key={row.competency}>
                    <td>{competencyLabel(dateToCompetency(row.competency))}</td>
                    <td className="fp-num">{formatInteger(row.lives)}</td>
                    <td className="fp-num">
                      {row.value_per_life === null
                        ? "sem regra vigente"
                        : formatCurrency(row.value_per_life)}
                    </td>
                    <td className="fp-num">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fp-panel-footnote">
          O valor soma cada indicação com o valor por vida dela: o próprio, quando configurado, ou o
          da regra do parceiro no mês.
        </p>
      </section>

      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Dados do cadastro</h2>
          <span>editados só pelo diretor</span>
        </div>
        <div className="fp-form-section">
          <PartnerForm partner={partner} />
        </div>
      </section>
    </AppShell>
  );
}
