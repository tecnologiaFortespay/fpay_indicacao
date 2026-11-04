import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { ApprovalForm, RejectionForm } from "@/components/approval-form";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/fields";
import { FormDisclosure } from "@/components/form-disclosure";
import { KeyValueStrip } from "@/components/key-value-strip";
import { MutationForm } from "@/components/mutation-form";
import { Notice } from "@/components/notice";
import { PartnerForm } from "@/components/partner-form";
import { PanelBody, SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import { lastClosedCompetency } from "@/lib/closings/queries";
import { formatCnpj } from "@/lib/cnpj";
import {
  competencyLabel,
  currentCompetency,
  dateToCompetency,
  formatDate,
  shortCompetencyLabel,
} from "@/lib/competency";
import { glossary } from "@/lib/glossary";
import { partnerKindLabels, partnerStatusLabels, referralStatusLabels } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import {
  getPartner,
  listPartnerMonthAmounts,
  listPartnerReferrals,
  listPartnerRules,
  partnerLogin,
  type Partner,
  type PartnerRule,
} from "@/lib/partners/queries";
import { currentRule, referralConfigLabel, ruleSentence } from "@/lib/referrals/config";
import { statusChipClass } from "@/lib/referrals/stages";
import {
  createPasswordReset,
  createReferral,
  deletePartnerRule,
  savePartnerRule,
} from "../actions";

export const metadata: Metadata = { title: "Parceiro" };

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> };

function placeOf(partner: Partner): string {
  if (!partner.city) {
    return "—";
  }
  return partner.state ? `${partner.city}/${partner.state}` : partner.city;
}

// Mesma faixa de dados para parceiro aguardando, recusado ou ativo.
function PartnerFacts({ partner }: { partner: Partner }) {
  const kind = partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind;
  const status =
    partnerStatusLabels[partner.status as keyof typeof partnerStatusLabels] ?? partner.status;
  const contact = [partner.contact_email, partner.contact_phone].filter(Boolean).join(" · ") || "—";
  return (
    <KeyValueStrip
      facts={[
        ["Situação", status],
        ["Tipo", kind],
        ["Local", placeOf(partner)],
        ["Responsável", partner.contact_name ?? "—"],
        ["Contato", contact],
        ["Cadastrado em", formatDate(partner.created_at)],
        ["Aprovado em", partner.approved_at ? formatDate(partner.approved_at) : "—"],
      ]}
    />
  );
}

function BackLink() {
  return (
    <Link href="/parceiros" className="fp-detail-back">
      ← Parceiros
    </Link>
  );
}

function PendingPartner({ partner, flash }: { partner: Partner; flash?: string }) {
  const rejected = partner.status === "rejected";
  return (
    <AppShell title={partner.name} flash={flash}>
      <BackLink />
      <PartnerFacts partner={partner} />
      {rejected && (
        <Notice tone="danger" title="Cadastro recusado">
          Motivo: {partner.rejection_reason ?? "não informado"}. O parceiro vê este motivo ao entrar
          e continua sem acesso.
        </Notice>
      )}
      <SectionCard
        title={rejected ? "Reconsiderar: aprovar o cadastro" : "Aprovar o cadastro"}
        subtitle="Para liberar o acesso, defina quanto este parceiro recebe por vida paga. Depois dá para criar novas vigências e dar valor próprio a uma indicação."
      >
        <PanelBody>
          <ApprovalForm partner={partner} label="Aprovar e liberar acesso" />
        </PanelBody>
      </SectionCard>
      {!rejected && (
        <SectionCard
          title="Ou recusar o cadastro"
          subtitle="O parceiro continua sem acesso e vê o motivo que você escrever."
        >
          <PanelBody>
            <RejectionForm partner={partner} />
          </PanelBody>
        </SectionCard>
      )}
    </AppShell>
  );
}

// Só a vigência mais recente muda, e só enquanto nenhum mês fechado a usa; as anteriores são histórico.
function EditLatestRule({ rule, partnerId }: { rule: PartnerRule; partnerId: string }) {
  return (
    <FormDisclosure
      label={`Editar a vigência de ${shortCompetencyLabel(dateToCompetency(rule.valid_from))}`}
      description="Corrige a vigência mais recente. Para mudar o valor a partir de um mês, prefira criar uma nova vigência."
    >
      <MutationForm action={savePartnerRule} label="Salvar alteração" resetOnSuccess={false}>
        <input type="hidden" name="id" value={rule.id} />
        <input type="hidden" name="partner_id" value={partnerId} />
        <div className="fp-form-grid fp-form-grid-3">
          <Field
            label={glossary.valuePerLife.label}
            name="value_per_life"
            required
            inputMode="decimal"
            defaultValue={String(rule.value_per_life).replace(".", ",")}
          />
          <Field
            label={glossary.validFrom.label}
            name="valid_from"
            type="month"
            required
            defaultValue={dateToCompetency(rule.valid_from)}
          />
          <Field
            label={glossary.termMonths.label}
            name="term_months"
            type="number"
            min={1}
            max={120}
            defaultValue={rule.term_months === null ? "" : String(rule.term_months)}
            hint={glossary.termMonths.hint}
          />
        </div>
      </MutationForm>
      <div className="mt-4">
        <MutationForm
          action={deletePartnerRule}
          label="Remover esta vigência"
          pendingLabel="Removendo…"
          variant="outline"
        >
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="partner_id" value={partnerId} />
        </MutationForm>
      </div>
    </FormDisclosure>
  );
}

export default async function PartnerDetailPage({ params, searchParams }: PageProps) {
  await requireRole("director");
  const { id } = await params;
  const { msg } = await searchParams;
  if (!z.uuid().safeParse(id).success) {
    redirect("/parceiros");
  }
  const partner = await getPartner(id);
  if (!partner) {
    notFound();
  }
  if (partner.status !== "active") {
    return <PendingPartner partner={partner} flash={msg} />;
  }
  const [rules, referrals, amounts, lockedThrough, login] = await Promise.all([
    listPartnerRules(id),
    listPartnerReferrals(id),
    listPartnerMonthAmounts(id),
    lastClosedCompetency(),
    partnerLogin(id),
  ]);
  const today = currentCompetency();
  const latest = rules[0];
  const latestEditable =
    latest !== undefined &&
    (lockedThrough === null || dateToCompetency(latest.valid_from) > lockedThrough);
  const rule = currentRule(rules, today);
  return (
    <AppShell title={partner.name} flash={msg}>
      <BackLink />
      <PartnerFacts partner={partner} />

      <SectionCard
        title="Regra de remuneração"
        subtitle="Quanto este parceiro recebe por vida paga. Vale para as indicações sem valor próprio."
        footnote="Uma vigência nova vale do mês dela em diante; as anteriores ficam como histórico. Só a mais recente pode ser editada, e só enquanto nenhum mês fechado a usa."
      >
        <PanelBody>
          <p className="fp-sentence">
            {rule ? (
              <>
                Hoje: <strong>{ruleSentence(rule, today)}</strong>
              </>
            ) : (
              "Sem regra cadastrada: as vidas deste parceiro contam com valor zero até existir uma vigência."
            )}
          </p>
        </PanelBody>
        {rules.length > 0 && (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Vale a partir de</th>
                  <th className="fp-num">Valor por vida</th>
                  <th>Prazo</th>
                  <th>Pode mudar?</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((item) => (
                  <tr key={item.id}>
                    <td>{competencyLabel(dateToCompetency(item.valid_from))}</td>
                    <td className="fp-num">{formatCurrency(item.value_per_life)}</td>
                    <td>{item.term_months === null ? "sem prazo" : `${item.term_months} meses`}</td>
                    <td>
                      {item.id !== latest?.id
                        ? "não, histórico"
                        : latestEditable
                          ? "sim, é a mais recente"
                          : "não, já usada em mês fechado"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {latest && latestEditable && <EditLatestRule rule={latest} partnerId={partner.id} />}
        <FormDisclosure
          label="Nova vigência"
          description="Use quando o valor ou o prazo mudar a partir de um mês. Os meses anteriores continuam com a regra antiga."
        >
          <MutationForm action={savePartnerRule} label="Salvar nova vigência">
            <input type="hidden" name="partner_id" value={partner.id} />
            <div className="fp-form-grid fp-form-grid-3">
              <Field
                label={glossary.valuePerLife.label}
                name="value_per_life"
                required
                placeholder="1,50"
                inputMode="decimal"
                hint={glossary.valuePerLife.hint}
              />
              <Field
                label={glossary.validFrom.label}
                name="valid_from"
                type="month"
                required
                defaultValue={today}
                hint={glossary.validFrom.hint}
              />
              <Field
                label={glossary.termMonths.label}
                name="term_months"
                type="number"
                min={1}
                max={120}
                hint={glossary.termMonths.hint}
              />
            </div>
          </MutationForm>
        </FormDisclosure>
      </SectionCard>

      <SectionCard
        title={`Indicações deste parceiro (${referrals.length})`}
        subtitle="Só a indicação Ativa rende comissão. Abra uma indicação para dar a ela valor ou prazo próprios."
      >
        {referrals.length === 0 ? (
          <EmptyState title="Nenhuma indicação registrada">
            O parceiro registra as indicações pelo portal dele; você também pode registrar abaixo.
          </EmptyState>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Situação</th>
                  <th>Rende desde</th>
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
                      <small className="fp-num">{formatCnpj(referral.cnpj)}</small>
                    </td>
                    <td>
                      <span className={statusChipClass(referral.status)}>
                        {referralStatusLabels[
                          referral.status as keyof typeof referralStatusLabels
                        ] ?? referral.status}
                      </span>
                    </td>
                    <td>
                      {referral.activated_competency
                        ? shortCompetencyLabel(dateToCompetency(referral.activated_competency))
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
        <FormDisclosure
          label="Registrar indicação em nome do parceiro"
          description="Na prática o parceiro registra pelo portal; use aqui quando ele pedir."
        >
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
                label={glossary.referralValue.label}
                name="value_per_life"
                inputMode="decimal"
                placeholder="regra do parceiro"
                hint={glossary.referralValue.hint}
              />
              <Field
                label={glossary.referralTerm.label}
                name="term_months"
                type="number"
                min={1}
                max={120}
                placeholder="regra do parceiro"
                hint={glossary.referralTerm.hint}
              />
            </div>
          </MutationForm>
        </FormDisclosure>
      </SectionCard>

      <SectionCard
        title="Vidas e valores por mês"
        subtitle="Últimos 12 meses com vidas nas planilhas do BI."
        footnote="O valor soma cada indicação com o valor por vida dela: o próprio, quando configurado, ou o da regra do parceiro no mês. Meses fechados: o valor oficial está em Fechamento do mês."
      >
        {amounts.length === 0 ? (
          <EmptyState title="Nenhuma vida paga ainda">
            Aparece aqui quando alguma indicação deste parceiro tiver vidas numa planilha do BI.
          </EmptyState>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="fp-num">Vidas pagas</th>
                  <th className="fp-num">Valor por vida (regra)</th>
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
                        ? "sem regra"
                        : formatCurrency(row.value_per_life)}
                    </td>
                    <td className="fp-num">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Acesso ao sistema"
        subtitle={
          login
            ? `Login do parceiro: ${partner.contact_email ?? "e-mail do cadastro"}.`
            : "Este parceiro ainda não tem login."
        }
      >
        <PanelBody>
          {login ? (
            <MutationForm
              action={createPasswordReset}
              label="Gerar link de nova senha"
              pendingLabel="Gerando…"
              variant="outline"
              linkLabel="Link de nova senha"
            >
              <p className="fp-help">
                Se o parceiro esqueceu a senha, gere o link e envie a ele (WhatsApp, e-mail). Ele
                abre o link, define a senha nova e entra. O link vale por 24 horas e uma única vez;
                gerar outro invalida o anterior.
              </p>
              <input type="hidden" name="partner_id" value={partner.id} />
            </MutationForm>
          ) : (
            <p className="fp-help">
              O login nasce quando o parceiro faz o cadastro pelo link do convite.
            </p>
          )}
        </PanelBody>
      </SectionCard>

      <SectionCard
        title="Dados do cadastro"
        subtitle="Preenchidos pelo parceiro; só o diretor altera."
      >
        <FormDisclosure label="Editar dados do cadastro">
          <PartnerForm partner={partner} />
        </FormDisclosure>
      </SectionCard>
    </AppShell>
  );
}
