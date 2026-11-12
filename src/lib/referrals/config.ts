import { addMonths, dateToCompetency, shortCompetencyLabel } from "@/lib/competency";
import { formatCurrency } from "@/lib/money";

// Textos da configuração da indicação. A contagem e o valor em si são feitos no SQL
// (view referral_month_lives); aqui só se descreve o que vale para a tela.

export function referralConfigLabel(
  valuePerLife: number | string | null,
  termMonths: number | null,
): string {
  const parts: string[] = [];
  if (valuePerLife !== null) {
    parts.push(`${formatCurrency(valuePerLife)} por vida`);
  }
  if (termMonths !== null) {
    parts.push(`${termMonths} meses`);
  }
  return parts.length === 0 ? "regra do parceiro" : parts.join(" · ");
}

// Prazo efetivo: N meses a partir do primeiro mês pago ("12 meses: ago/2026 a jul/2027").
export function termLabel(termMonths: number | null, activatedCompetency: string | null): string {
  if (termMonths === null) {
    return "sem prazo";
  }
  if (!activatedCompetency) {
    return `${termMonths} meses a partir do 1º pagamento`;
  }
  const first = dateToCompetency(activatedCompetency);
  const last = addMonths(first, termMonths - 1);
  return `${termMonths} meses: ${shortCompetencyLabel(first)} a ${shortCompetencyLabel(last)}`;
}

// Vigência do parceiro (valor obrigatório) ou da indicação (valor em branco = o do parceiro).
type RuleLike = {
  value_per_life: number | string | null;
  term_months: number | null;
  valid_from: string;
};

// Regra que vale hoje, entre as vigências (da mais nova para a mais antiga): a mais recente que já
// começou; sem nenhuma começada, a próxima.
export function currentRule<T extends RuleLike>(rules: T[], today: string): T | null {
  const sorted = [...rules].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  return sorted.find((rule) => dateToCompetency(rule.valid_from) <= today) ?? sorted.at(-1) ?? null;
}

// Vigência em vigor no mês: a mais recente que já começou. Diferente de currentRule, não devolve
// uma vigência futura: antes do início dela o cálculo (view referral_month_lives) não a usa.
export function ruleInMonth<T extends RuleLike>(rules: T[], competency: string): T | null {
  const sorted = [...rules].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  return sorted.find((rule) => dateToCompetency(rule.valid_from) <= competency) ?? null;
}

// Vigência própria da indicação em vigor no mês, se houver (decisão 23).
export function ownRuleOf<T extends RuleLike>(
  rulesByReferral: Map<string, T[]>,
  referralId: string,
  competency: string,
): T | null {
  return ruleInMonth(rulesByReferral.get(referralId) ?? [], competency);
}

// Coluna "Valor e prazo" das listas: o que vale para a indicação no mês e, em letra menor, desde
// quando vale ou o que muda na próxima vigência ("a partir de nov/2026: R$ 2,50 por vida").
export function referralRuleSummary(
  ownRules: RuleLike[],
  competency: string,
): { label: string; note: string | null } {
  const own = ruleInMonth(ownRules, competency);
  const next = [...ownRules]
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from))
    .find((rule) => dateToCompetency(rule.valid_from) > competency);
  const label = referralConfigLabel(own?.value_per_life ?? null, own?.term_months ?? null);
  if (next) {
    const start = shortCompetencyLabel(dateToCompetency(next.valid_from));
    const change = referralConfigLabel(next.value_per_life, next.term_months);
    return { label, note: `a partir de ${start}: ${change}` };
  }
  return {
    label,
    note: own ? `desde ${shortCompetencyLabel(dateToCompetency(own.valid_from))}` : null,
  };
}

export type EffectiveTerms = { valuePerLife: number | null; termMonths: number | null };

// Valor e prazo que valem para a indicação: a vigência própria manda; em branco, a regra do parceiro.
export function effectiveTerms(own: RuleLike | null, partnerRule: RuleLike | null): EffectiveTerms {
  const value = own?.value_per_life ?? partnerRule?.value_per_life ?? null;
  return {
    valuePerLife: value === null ? null : Number(value),
    termMonths: own?.term_months ?? partnerRule?.term_months ?? null,
  };
}

// "R$ 1,80 por vida · sem prazo · vale desde out/2026"
export function ruleSentence(rule: RuleLike, today: string): string {
  const start = dateToCompetency(rule.valid_from);
  const value =
    rule.value_per_life === null
      ? "valor do parceiro"
      : `${formatCurrency(rule.value_per_life)} por vida`;
  const term =
    rule.term_months === null ? "sem prazo" : `prazo de ${rule.term_months} meses por cliente`;
  const since =
    start <= today
      ? `vale desde ${shortCompetencyLabel(start)}`
      : `vale a partir de ${shortCompetencyLabel(start)}`;
  return `${value} · ${term} · ${since}`;
}
