import { currentCompetency, dateToCompetency, shortCompetencyLabel } from "@/lib/competency";
import { formatCurrency } from "@/lib/money";

// Qual vigência do parceiro vale para uma indicação (decisões 23, 24 e 27). O cálculo é do SQL
// (view referral_month_lives); aqui a mesma escolha é repetida só para a tela dizer de onde veio o
// valor e montar a lista de vigências que o diretor pode escolher.

type PartnerRuleLike = {
  value_per_life: number | string | null;
  term_months: number | null;
  valid_from: string;
};

// Mês de referência automático: o mais antigo entre o mês em que a indicação foi feita (calendário
// de Fortaleza) e o do primeiro pagamento informado pelo BI.
export function automaticRuleMonth(createdAt: string, firstCashin: string | null): string {
  const created = currentCompetency(new Date(createdAt));
  const cashin = firstCashin ? dateToCompetency(firstCashin) : null;
  return cashin !== null && cashin < created ? cashin : created;
}

// Mês de referência da indicação: o escolhido pelo diretor ou, sem escolha, o automático.
export function referenceMonth(referral: {
  created_at: string;
  first_cashin: string | null;
  rule_month: string | null;
}): string {
  return referral.rule_month
    ? dateToCompetency(referral.rule_month)
    : automaticRuleMonth(referral.created_at, referral.first_cashin);
}

// Vigência do parceiro que vale no mês para uma indicação com esse mês de referência: entre as que
// já valem no mês, a mais recente que já existia no mês de referência; se nenhuma existia ainda, a
// primeira que passou a valer.
export function partnerRuleFor<T extends PartnerRuleLike>(
  rules: T[],
  reference: string,
  competency: string,
): T | null {
  const inForce = rules
    .filter((rule) => dateToCompetency(rule.valid_from) <= competency)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const known = inForce.filter((rule) => dateToCompetency(rule.valid_from) <= reference);
  return known.at(-1) ?? inForce[0] ?? null;
}

// "vigência de set/2026: R$ 1,00 por vida · 12 meses"
export function ruleChoiceLabel(rule: PartnerRuleLike): string {
  const start = shortCompetencyLabel(dateToCompetency(rule.valid_from));
  const value =
    rule.value_per_life === null ? "sem valor" : `${formatCurrency(rule.value_per_life)} por vida`;
  const term = rule.term_months === null ? "sem prazo" : `${rule.term_months} meses`;
  return `vigência de ${start}: ${value} · ${term}`;
}

// "set/2026 · R$ 1,50 · sem prazo": versão curta, para a opção caber inteira no seletor.
function optionLabel(rule: PartnerRuleLike): string {
  const start = shortCompetencyLabel(dateToCompetency(rule.valid_from));
  const value = rule.value_per_life === null ? "sem valor" : formatCurrency(rule.value_per_life);
  const term = rule.term_months === null ? "sem prazo" : `${rule.term_months} meses`;
  return `${start} · ${value} · ${term}`;
}

export type RuleChoice = {
  // Opções do seletor: "" = automática; as outras são o mês ("YYYY-MM") de cada vigência do parceiro.
  options: [string, string][];
  // Opção marcada hoje.
  selected: string;
  // Vigência que vale no mês mostrado, se o parceiro já tem alguma em vigor.
  applied: PartnerRuleLike | null;
};

// Monta a escolha de uma indicação para o mês mostrado na tela.
export function ruleChoice(
  referral: { created_at: string; first_cashin: string | null; rule_month: string | null },
  partnerRules: PartnerRuleLike[],
  competency: string,
): RuleChoice {
  const sorted = [...partnerRules].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const automatic = partnerRuleFor(
    sorted,
    automaticRuleMonth(referral.created_at, referral.first_cashin),
    competency,
  );
  const options: [string, string][] = [
    ["", automatic ? `Automática (${optionLabel(automatic)})` : "Automática"],
    ...sorted.map(
      (rule) =>
        [dateToCompetency(rule.valid_from), `Vigência de ${optionLabel(rule)}`] as [string, string],
    ),
  ];
  const chosen = referral.rule_month ? dateToCompetency(referral.rule_month) : "";
  return {
    options,
    // Vigência escolhida que foi removida depois: a tela volta a mostrar "Automática".
    selected: options.some(([value]) => value === chosen) ? chosen : "",
    applied: partnerRuleFor(sorted, referenceMonth(referral), competency),
  };
}
