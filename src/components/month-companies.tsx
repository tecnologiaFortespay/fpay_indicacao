import Link from "next/link";
import { livesByCnpj } from "@/lib/ai/reviews";
import { lastClosedCompetency } from "@/lib/closings/queries";
import { formatCnpj } from "@/lib/cnpj";
import {
  competencyLabel,
  dateToCompetency,
  formatDate,
  shortCompetencyLabel,
} from "@/lib/competency";
import { formatCurrency, formatInteger } from "@/lib/money";
import { listAllRules, listReferralRules, type PartnerRule } from "@/lib/partners/queries";
import { ownRuleOf } from "@/lib/referrals/config";
import {
  listReferrals,
  referralMonthValues,
  ruleChoiceLocks,
  type ReferralRow,
} from "@/lib/referrals/queries";
import { ruleChoice, ruleChoiceLabel, type RuleChoice } from "@/lib/referrals/rule-choice";
import { EmptyState } from "./empty-state";
import { RuleChoiceForm } from "./rule-choice-form";
import { SectionCard } from "./section-card";

type CompanyRow = {
  referral: ReferralRow;
  lives: number;
  // Valor por vida, prazo e valor do mês; null = a indicação não conta no mês.
  month: { value_per_life: number | null; term_months: number | null; amount: number } | null;
  own: PartnerRule | null;
  choice: RuleChoice;
  canChoose: boolean;
  // Último mês fechado em que a indicação teve vidas ("YYYY-MM"), se houver.
  locked: string | null;
  // Primeiro mês pago da empresa é o mês mostrado.
  isNew: boolean;
};

// De onde vem o valor da indicação no mês: a vigência própria dela ou a do parceiro.
function origin(row: CompanyRow): string {
  const ownValue = row.own?.value_per_life ?? null;
  const ownTerm = row.own?.term_months ?? null;
  if (ownValue !== null && ownTerm !== null) {
    return "valor e prazo próprios da indicação";
  }
  if (!row.choice.applied) {
    return ownValue !== null ? "valor próprio da indicação" : "parceiro sem vigência neste mês";
  }
  const rule = ruleChoiceLabel(row.choice.applied);
  const how = row.referral.rule_month ? "escolhida pelo diretor" : "automática";
  if (ownValue !== null) {
    return `valor próprio da indicação; prazo da ${rule} (${how})`;
  }
  if (ownTerm !== null) {
    return `prazo próprio da indicação; valor da ${rule} (${how})`;
  }
  return `${rule} (${how})`;
}

function terms(month: NonNullable<CompanyRow["month"]>): string {
  const value =
    month.value_per_life === null
      ? "sem valor"
      : `${formatCurrency(month.value_per_life)} por vida`;
  const term = month.term_months === null ? "sem prazo" : `${month.term_months} meses`;
  return `${value} · ${term}`;
}

// Empresas indicadas com vidas no mês do envio e a vigência do parceiro aplicada a cada uma
// (decisão 27). É aqui que o diretor troca a vigência de uma empresa nova que deve seguir outra:
// só aparece o seletor para quem pode mudar (parceiro com mais de uma vigência e indicação sem vidas
// em mês fechado).
export async function MonthCompanies({
  competency,
  returnTo,
}: {
  competency: string;
  returnTo: string;
}) {
  const [referrals, lives, values, rules, locks, lastClosed] = await Promise.all([
    listReferrals(),
    livesByCnpj(competency),
    referralMonthValues(competency),
    listAllRules(),
    ruleChoiceLocks(),
    lastClosedCompetency(),
  ]);
  const inMonth = referrals.filter((referral) => lives.has(referral.cnpj));
  const ownRules = await listReferralRules(inMonth.map((referral) => referral.id));
  const monthClosed = lastClosed !== null && competency <= lastClosed;
  const rows: CompanyRow[] = inMonth
    .map((referral) => {
      const partnerRules = rules.filter((rule) => rule.partner_id === referral.partner_id);
      const own = ownRuleOf(ownRules, referral.id, competency);
      const locked = locks.get(referral.id) ?? null;
      // Com valor e prazo próprios, a vigência do parceiro não muda nada para a indicação.
      const ownCoversAll = own !== null && own.value_per_life !== null && own.term_months !== null;
      return {
        referral,
        lives: lives.get(referral.cnpj) ?? 0,
        month: values.get(referral.id) ?? null,
        own,
        choice: ruleChoice(referral, partnerRules, competency),
        canChoose: !monthClosed && locked === null && partnerRules.length > 1 && !ownCoversAll,
        locked,
        isNew:
          referral.activated_competency !== null &&
          dateToCompetency(referral.activated_competency) === competency,
      };
    })
    // Empresas novas no mês primeiro: são as que pedem conferência da vigência.
    .sort(
      (a, b) =>
        Number(b.isNew) - Number(a.isNew) ||
        a.referral.partner_name.localeCompare(b.referral.partner_name, "pt-BR") ||
        a.referral.company_name.localeCompare(b.referral.company_name, "pt-BR"),
    );
  const month = competencyLabel(competency);
  const choosable = rows.filter((row) => row.canChoose).length;
  return (
    <SectionCard
      title={`Empresas com vidas em ${month} (${rows.length})`}
      subtitle="Cada empresa indicada com vidas neste mês e a vigência do parceiro aplicada a ela. Empresa nova que deve seguir outra vigência do parceiro (ex.: pagou no começo do mês, mas vale a regra do mês anterior): escolha em “Vigência aplicada” e clique em Aplicar."
      footnote={
        monthClosed
          ? `${month} já está fechado: os valores do fechamento não mudam e a vigência não pode mais ser trocada aqui.`
          : `A escolha vale para os meses abertos e aparece na hora para o parceiro. Só dá para trocar a vigência de quem ainda não teve vidas num mês fechado e quando o parceiro tem mais de uma vigência (${choosable} empresa(s) nesta lista). Mostra a base atual do mês: se houve um envio mais novo, valem as vidas dele.`
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={`Nenhuma empresa indicada com vidas em ${month}`}>
          Aparecem aqui as empresas do arquivo que são indicações cadastradas na plataforma.
        </EmptyState>
      ) : (
        <div className="fp-table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Parceiro</th>
                <th>Indicada em</th>
                <th>1º pagamento (BI)</th>
                <th className="fp-num">Vidas</th>
                <th>Vigência aplicada</th>
                <th className="fp-num">Valor do mês</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.referral.id}>
                  <td>
                    <Link href={`/indicacoes/${row.referral.id}`}>{row.referral.company_name}</Link>
                    <small className="fp-num">{formatCnpj(row.referral.cnpj)}</small>
                    {row.isNew && <small>nova: 1º mês pago</small>}
                  </td>
                  <td>{row.referral.partner_name}</td>
                  <td>{formatDate(row.referral.created_at)}</td>
                  <td>
                    {row.referral.first_cashin
                      ? shortCompetencyLabel(dateToCompetency(row.referral.first_cashin))
                      : "—"}
                  </td>
                  <td className="fp-num">{formatInteger(row.lives)}</td>
                  <td>
                    {row.month ? <strong>{terms(row.month)}</strong> : "não conta neste mês"}
                    <small>{origin(row)}</small>
                    {row.canChoose && (
                      <RuleChoiceForm
                        referralId={row.referral.id}
                        companyName={row.referral.company_name}
                        choice={row.choice}
                        returnTo={returnTo}
                      />
                    )}
                    {!row.canChoose && !monthClosed && row.locked && (
                      <small>já teve vidas em mês fechado: a vigência não muda por aqui</small>
                    )}
                  </td>
                  <td className="fp-num">{row.month ? formatCurrency(row.month.amount) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
