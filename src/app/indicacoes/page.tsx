import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { Field, SelectField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { requireRole, type AuthorizedUser } from "@/lib/auth/session";
import { formatCnpj } from "@/lib/cnpj";
import { competencyLabel, dateToCompetency, formatDate } from "@/lib/competency";
import { latestCompetency } from "@/lib/dashboard/queries";
import { referralStatusLabels, type ReferralStatus } from "@/lib/labels";
import { formatInteger } from "@/lib/money";
import { listPartnerOptions } from "@/lib/partners/queries";
import { referralConfigLabel } from "@/lib/referrals/config";
import {
  listReferrals,
  referralMonthValues,
  referralStatusCounts,
  type ReferralMonth,
  type ReferralRow,
} from "@/lib/referrals/queries";
import { allowedTransitions, referralStatusClass } from "@/lib/referrals/transitions";
import { createReferral } from "@/app/parceiros/actions";
import { setReferralStatus } from "./actions";

export const metadata: Metadata = { title: "Indicações" };

type PageProps = { searchParams: Promise<{ status?: string; partner?: string }> };

const statusEntries = Object.entries(referralStatusLabels) as [ReferralStatus, string][];

function StatusChip({ status }: { status: string }) {
  const label = referralStatusLabels[status as ReferralStatus] ?? status;
  return <span className={referralStatusClass(status)}>{label}</span>;
}

function firstPaidMonth(referral: ReferralRow): string {
  return referral.activated_competency
    ? competencyLabel(dateToCompetency(referral.activated_competency))
    : "—";
}

function ReferralTable({
  referrals,
  months,
  competency,
  director,
}: {
  referrals: ReferralRow[];
  months: Map<string, ReferralMonth>;
  competency: string | null;
  director: boolean;
}) {
  if (referrals.length === 0) {
    return <p className="fp-panel-footnote">Nenhuma indicação encontrada.</p>;
  }
  return (
    <div className="fp-table-wrap">
      <table className="fp-table">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>CNPJ</th>
            {director && <th>Parceiro</th>}
            <th>Situação</th>
            <th>1º mês pago</th>
            {director && <th>Valor e prazo</th>}
            <th className="fp-num">Vidas estimadas</th>
            <th className="fp-num">
              {competency ? `Vidas em ${competencyLabel(competency)}` : "Vidas pagas"}
            </th>
            <th>Indicada em</th>
            {director && <th>Mudar situação</th>}
          </tr>
        </thead>
        <tbody>
          {referrals.map((referral) => {
            const options = allowedTransitions(referral.status).map(
              (status) => [status, referralStatusLabels[status]] as [string, string],
            );
            const month = months.get(referral.id);
            return (
              <tr key={referral.id}>
                <td>
                  {director ? (
                    <Link href={`/indicacoes/${referral.id}`}>{referral.company_name}</Link>
                  ) : (
                    referral.company_name
                  )}
                </td>
                <td className="fp-num">{formatCnpj(referral.cnpj)}</td>
                {director && <td>{referral.partner_name}</td>}
                <td>
                  <StatusChip status={referral.status} />
                </td>
                <td>{firstPaidMonth(referral)}</td>
                {director && (
                  <td>{referralConfigLabel(referral.value_per_life, referral.term_months)}</td>
                )}
                <td className="fp-num">
                  {referral.estimated_lives === null
                    ? "—"
                    : formatInteger(referral.estimated_lives)}
                </td>
                <td className="fp-num">{month ? formatInteger(month.lives) : "—"}</td>
                <td>{formatDate(referral.created_at)}</td>
                {director && (
                  <td>
                    {options.length === 0 ? (
                      "—"
                    ) : (
                      <MutationForm
                        action={setReferralStatus}
                        label="Alterar"
                        pendingLabel="Alterando…"
                        variant="outline"
                      >
                        <input type="hidden" name="id" value={referral.id} />
                        <div className="fp-inline-form">
                          <SelectField
                            label={`Nova situação de ${referral.company_name}`}
                            name="status"
                            options={options}
                          />
                        </div>
                      </MutationForm>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function PartnerReferrals({ user }: { user: AuthorizedUser }) {
  const partnerId = user.profile.partner?.id ?? "";
  const competency = await latestCompetency();
  const [referrals, months] = await Promise.all([
    listReferrals({ partnerId }),
    competency
      ? referralMonthValues(competency)
      : Promise.resolve(new Map<string, ReferralMonth>()),
  ]);
  return (
    <AppShell title="Minhas indicações">
      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Nova indicação</h2>
          <span>vale a primeira indicação de cada CNPJ</span>
        </div>
        <div className="fp-form-section">
          <MutationForm action={createReferral} label="Registrar indicação">
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
            </div>
          </MutationForm>
        </div>
      </section>
      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Indicações</h2>
          <span>{referrals.length} indicação(ões)</span>
        </div>
        <ReferralTable
          referrals={referrals}
          months={months}
          competency={competency}
          director={false}
        />
        <p className="fp-panel-footnote">
          Ativa: o cliente pagou e as vidas contam. Inadimplente: cliente ativo sem pagamento no
          último mês importado. A situação muda automaticamente a cada importação do BI. Valor e
          prazo de cada indicação aparecem em Meu painel.
        </p>
      </section>
    </AppShell>
  );
}

async function DirectorReferrals({ params }: { params: { status?: string; partner?: string } }) {
  const status = statusEntries.some(([value]) => value === params.status)
    ? params.status
    : undefined;
  const partnerId = z.uuid().safeParse(params.partner).success ? params.partner : undefined;
  const competency = await latestCompetency();
  const [referrals, counts, options, months] = await Promise.all([
    listReferrals({ partnerId, status }),
    referralStatusCounts(),
    listPartnerOptions(),
    competency
      ? referralMonthValues(competency)
      : Promise.resolve(new Map<string, ReferralMonth>()),
  ]);
  const partnerOptions: [string, string][] = [["", "Todos os parceiros"], ...options];
  const statusOptions: [string, string][] = [["", "Todas as situações"], ...statusEntries];
  return (
    <AppShell title="Indicações">
      <div className="fp-management-intro">
        <p>
          Indicações de todos os parceiros, com a situação de cada CNPJ. Abra uma indicação para
          definir valor por vida e prazo próprios.
        </p>
      </div>
      <div className="fp-kpi-grid fp-management-kpis">
        {statusEntries.map(([value, label]) => (
          <Link
            key={value}
            href={`/indicacoes?status=${value}`}
            className="fp-kpi"
            aria-current={status === value ? "page" : undefined}
          >
            <div className="fp-kpi-heading">
              <h2>{label}</h2>
            </div>
            <p className="fp-kpi-value fp-num">{formatInteger(counts[value])}</p>
          </Link>
        ))}
      </div>
      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Lista</h2>
          <span>{referrals.length} indicação(ões)</span>
        </div>
        <form className="fp-form-section fp-management-filters">
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
          <span />
          <button className="fp-button-secondary">Filtrar</button>
        </form>
        <ReferralTable referrals={referrals} months={months} competency={competency} director />
      </section>
      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Registrar indicação em nome de um parceiro</h2>
          <span>na prática o parceiro registra; aqui é a exceção</span>
        </div>
        <div className="fp-form-section">
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
