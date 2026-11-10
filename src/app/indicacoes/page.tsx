import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Field, SelectField } from "@/components/fields";
import { FormDisclosure } from "@/components/form-disclosure";
import { MutationForm } from "@/components/mutation-form";
import { PageIntro } from "@/components/page-intro";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { requireRole, type AuthorizedUser } from "@/lib/auth/session";
import { formatCnpj } from "@/lib/cnpj";
import {
  competencyLabel,
  currentCompetency,
  dateToCompetency,
  formatDate,
  formatDateTime,
  isCompetency,
  shortCompetencyLabel,
} from "@/lib/competency";
import { latestCompetency } from "@/lib/dashboard/queries";
import { glossary } from "@/lib/glossary";
import { referralStatusLabels, type ReferralStatus } from "@/lib/labels";
import { formatInteger } from "@/lib/money";
import { lastImportAt } from "@/lib/partner-panel/queries";
import { listPartnerOptions, ruleInForce } from "@/lib/partners/queries";
import { referralConfigLabel } from "@/lib/referrals/config";
import {
  listReferrals,
  referralMonthValues,
  referralStatusCounts,
  type ReferralMonth,
  type ReferralRow,
} from "@/lib/referrals/queries";
import { matchesReferralSearch } from "@/lib/referrals/search";
import {
  conversionLabels,
  conversionSentence,
  conversionSummary,
  partnerStatusNames,
  referralExplanation,
  referralStage,
  stageDescriptions,
  stageGroupTitles,
  stageOrder,
  statusChipClass,
  type Stage,
} from "@/lib/referrals/stages";
import { allowedTransitions } from "@/lib/referrals/transitions";
import { createReferral } from "@/app/parceiros/actions";
import { setReferralStatus } from "./actions";

export const metadata: Metadata = { title: "Indicações" };

type SearchParams = {
  status?: string;
  partner?: string;
  q?: string;
  competency?: string;
  msg?: string;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

const statusEntries = Object.entries(referralStatusLabels) as [ReferralStatus, string][];

// Âncoras das três etapas (o painel do parceiro aponta para elas).
const stageAnchors: Record<Stage, string> = {
  earning: "rendendo",
  not_earning: "ainda-nao-rende",
  closed: "encerradas",
};

function sinceLabel(referral: ReferralRow): string {
  return referral.activated_competency
    ? shortCompetencyLabel(dateToCompetency(referral.activated_competency))
    : "—";
}

async function PartnerReferrals({ user }: { user: AuthorizedUser }) {
  const partnerId = user.profile.partner?.id ?? "";
  const competency = await latestCompetency();
  const [referrals, months, rule, updatedAt] = await Promise.all([
    listReferrals({ partnerId }),
    competency
      ? referralMonthValues(competency)
      : Promise.resolve(new Map<string, ReferralMonth>()),
    ruleInForce(partnerId, currentCompetency()),
    competency ? lastImportAt(competency) : Promise.resolve(null),
  ]);
  // Decisão 21: de quando é a base das vidas mostradas.
  const stamp = competency
    ? updatedAt
      ? ` Vidas em ${competencyLabel(competency)}: base do BI de ${formatDateTime(updatedAt)}.`
      : ` Ainda não houve envio da planilha de ${competencyLabel(competency)}.`
    : "";
  const groups = stageOrder.map((stage) => ({
    stage,
    items: referrals.filter((referral) => referralStage(referral.status) === stage),
  }));
  // Decisão 20: quantas viraram cliente, quantas andam e quantas se perderam, antes de qualquer vida.
  const summary = conversionSummary(referrals.map((referral) => referral.status));
  return (
    <AppShell title="Minhas indicações">
      <PageIntro>
        Vale a primeira indicação de cada CNPJ. Uma indicação começa a render comissão quando o
        cliente começa a pagar a Fortes Pay.{stamp}
      </PageIntro>

      <SectionCard title="Resumo" subtitle={conversionSentence(summary)}>
        <div className="fp-stage-counts">
          <div>
            <strong className="fp-num">{summary.client}</strong>
            <span>{conversionLabels.client}</span>
          </div>
          <div>
            <strong className="fp-num">{summary.in_progress}</strong>
            <span>{conversionLabels.in_progress}</span>
          </div>
          <div>
            <strong className="fp-num">{summary.lost}</strong>
            <span>{conversionLabels.lost}</span>
          </div>
        </div>
      </SectionCard>

      <section className="fp-panel" aria-label="Nova indicação">
        <FormDisclosure
          label="Nova indicação"
          open={referrals.length === 0}
          description="Informe a empresa que você está indicando. A Fortes Pay entra em contato com ela; você acompanha aqui cada etapa."
        >
          <MutationForm action={createReferral} label="Registrar indicação">
            <div className="fp-form-grid fp-form-grid-3">
              <Field
                label="CNPJ do cliente"
                name="cnpj"
                required
                maxLength={18}
                placeholder="00.000.000/0000-00"
              />
              <Field label="Empresa" name="company_name" required maxLength={240} />
              <Field
                label="Vidas estimadas"
                name="estimated_lives"
                type="number"
                min={0}
                hint="Quantos funcionários a empresa tem, se souber."
              />
            </div>
          </MutationForm>
        </FormDisclosure>
      </section>

      {groups.map(({ stage, items }) =>
        stage === "closed" && items.length === 0 ? null : (
          <SectionCard
            key={stage}
            id={stageAnchors[stage]}
            title={`${stageGroupTitles[stage]} (${items.length})`}
            subtitle={stageDescriptions[stage]}
          >
            {items.length === 0 ? (
              <EmptyState
                title={
                  stage === "earning"
                    ? "Nenhuma indicação rendendo ainda"
                    : "Nenhuma indicação esperando"
                }
              >
                {stage === "earning"
                  ? "Quando um cliente seu começar a pagar a Fortes Pay, ele aparece aqui com as vidas do mês."
                  : "Indicações novas aparecem aqui até o cliente começar a pagar."}
              </EmptyState>
            ) : (
              <div className="fp-table-wrap">
                <table className="fp-table">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Situação</th>
                      <th>O que está acontecendo</th>
                      {stage === "earning" && (
                        <th className="fp-num">
                          {competency ? `Vidas em ${competencyLabel(competency)}` : "Vidas pagas"}
                        </th>
                      )}
                      <th>Indicada em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((referral) => {
                      const month = months.get(referral.id);
                      return (
                        <tr key={referral.id}>
                          <td>
                            {referral.company_name}
                            <small className="fp-num">{formatCnpj(referral.cnpj)}</small>
                          </td>
                          <td>
                            <span className={statusChipClass(referral.status)}>
                              {partnerStatusNames[referral.status as ReferralStatus] ??
                                referral.status}
                            </span>
                          </td>
                          <td>
                            {referralExplanation(referral, {
                              valuePerLife:
                                month?.value_per_life ??
                                referral.value_per_life ??
                                rule?.value_per_life ??
                                null,
                              termMonths: referral.term_months ?? rule?.term_months ?? null,
                            })}
                          </td>
                          {stage === "earning" && (
                            <td className="fp-num">{month ? formatInteger(month.lives) : "0"}</td>
                          )}
                          <td>{formatDate(referral.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        ),
      )}
    </AppShell>
  );
}

function StatusForm({ referral, returnTo }: { referral: ReferralRow; returnTo: string }) {
  const options = allowedTransitions(referral.status).map(
    (status) => [status, referralStatusLabels[status]] as [string, string],
  );
  if (options.length === 0) {
    return <span className="fp-help">automática</span>;
  }
  return (
    <MutationForm
      action={setReferralStatus}
      label="Alterar"
      pendingLabel="Alterando…"
      variant="outline"
      size="sm"
      inline
    >
      <input type="hidden" name="id" value={referral.id} />
      <input type="hidden" name="return_to" value={returnTo} />
      <label>
        <span className="sr-only">Nova situação de {referral.company_name}</span>
        <select name="status" className="fp-input" style={{ minHeight: 32, padding: "4px 8px" }}>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
    </MutationForm>
  );
}

async function DirectorReferrals({ params }: { params: SearchParams }) {
  const status = statusEntries.some(([value]) => value === params.status)
    ? params.status
    : undefined;
  const partnerId = z.uuid().safeParse(params.partner).success ? params.partner : undefined;
  // Busca por CNPJ ou empresa (item 4 da reunião de 09/11/2026): filtra em memória a lista já lida.
  const search = (params.q ?? "").trim().slice(0, 120);
  // Mês das vidas: o escolhido no seletor ou, sem escolha, o mais recente com planilha.
  const latest = await latestCompetency();
  const competency = isCompetency(params.competency)
    ? params.competency
    : (latest ?? currentCompetency());
  const [all, counts, options, months] = await Promise.all([
    listReferrals({ partnerId, status }),
    referralStatusCounts(),
    listPartnerOptions(),
    referralMonthValues(competency),
  ]);
  const referrals = search
    ? all.filter((referral) => matchesReferralSearch(referral, search))
    : all;
  const filters: Record<string, string> = {};
  if (partnerId) {
    filters.partner = partnerId;
  }
  if (status) {
    filters.status = status;
  }
  if (search) {
    filters.q = search;
  }
  const query = new URLSearchParams(filters);
  if (isCompetency(params.competency)) {
    query.set("competency", competency);
  }
  const returnTo = query.size > 0 ? `/indicacoes?${query}` : "/indicacoes";
  const filtered = Boolean(status || partnerId || search);
  const partnerOptions: [string, string][] = [["", "Todos os parceiros"], ...options];
  const statusOptions: [string, string][] = [["", "Todas as situações"], ...statusEntries];
  return (
    <AppShell title="Indicações" flash={params.msg}>
      <PageIntro month={{ value: competency, label: "Mês", keep: filters }}>
        Indicações de todos os parceiros. Só rende comissão a indicação <strong>Ativa</strong>{" "}
        (cliente pagando). Ativa e Inadimplente mudam sozinhas a cada envio da planilha do BI; as
        outras situações você muda aqui. O mês escolhido define a coluna de vidas.
      </PageIntro>

      <SectionCard
        title="Indicações por etapa"
        subtitle="Clique numa situação para filtrar a lista."
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
                      <Link
                        href={`/indicacoes?status=${value}`}
                        aria-current={status === value ? "page" : undefined}
                      >
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

      <SectionCard
        title={`Lista (${referrals.length})`}
        subtitle={
          filtered
            ? "Filtrada. Limpe a busca e use Todas/Todos para ver tudo."
            : "Todas as indicações, das mais novas às mais antigas."
        }
      >
        <form className="fp-form-section fp-management-filters">
          {isCompetency(params.competency) && (
            <input type="hidden" name="competency" value={competency} />
          )}
          <SelectField
            label="Parceiro"
            name="partner"
            options={partnerOptions}
            defaultValue={partnerId ?? ""}
          />
          <SelectField
            label="Situação"
            name="status"
            options={statusOptions}
            defaultValue={status ?? ""}
          />
          <Field
            label="Buscar por CNPJ ou empresa"
            name="q"
            defaultValue={search}
            maxLength={120}
            placeholder="trecho do nome ou do CNPJ"
          />
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
        </form>
        {referrals.length === 0 ? (
          <EmptyState title="Nenhuma indicação encontrada">
            {filtered
              ? "Nenhuma indicação com esse filtro ou busca."
              : "Os parceiros registram as indicações pelo portal deles; você também pode registrar abaixo."}
          </EmptyState>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Parceiro</th>
                  <th>Situação</th>
                  <th>Rende desde</th>
                  <th>Valor e prazo</th>
                  <th className="fp-num">Vidas em {shortCompetencyLabel(competency)}</th>
                  <th>Indicada em</th>
                  <th>Mudar situação</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((referral) => {
                  const month = months.get(referral.id);
                  return (
                    <tr key={referral.id}>
                      <td>
                        <Link href={`/indicacoes/${referral.id}`}>{referral.company_name}</Link>
                        <small className="fp-num">{formatCnpj(referral.cnpj)}</small>
                      </td>
                      <td>{referral.partner_name}</td>
                      <td>
                        <span className={statusChipClass(referral.status)}>
                          {referralStatusLabels[referral.status as ReferralStatus] ??
                            referral.status}
                        </span>
                      </td>
                      <td>{sinceLabel(referral)}</td>
                      <td>{referralConfigLabel(referral.value_per_life, referral.term_months)}</td>
                      <td className="fp-num">{month ? formatInteger(month.lives) : "—"}</td>
                      <td>{formatDate(referral.created_at)}</td>
                      <td>
                        <StatusForm referral={referral} returnTo={returnTo} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <section className="fp-panel" aria-label="Registrar indicação em nome de um parceiro">
        <FormDisclosure
          label="Registrar indicação em nome de um parceiro"
          description="Na prática o parceiro registra pelo portal dele; use aqui quando ele pedir para você registrar."
        >
          <MutationForm action={createReferral} label="Registrar indicação">
            <div className="fp-form-grid">
              <SelectField
                label="Parceiro"
                name="partner_id"
                required
                options={[["", "Selecione"], ...options]}
              />
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
      </section>
    </AppShell>
  );
}

export default async function ReferralsPage({ searchParams }: PageProps) {
  const user = await requireRole("director", "partner");
  const params = await searchParams;
  if (user.profile.role === "partner") {
    return <PartnerReferrals user={user} />;
  }
  return <DirectorReferrals params={params} />;
}
