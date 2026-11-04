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

type RuleLike = { value_per_life: number | string; term_months: number | null; valid_from: string };

// Regra que vale hoje, entre as vigências (da mais nova para a mais antiga): a mais recente que já
// começou; sem nenhuma começada, a próxima.
export function currentRule<T extends RuleLike>(rules: T[], today: string): T | null {
  const sorted = [...rules].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  return sorted.find((rule) => dateToCompetency(rule.valid_from) <= today) ?? sorted.at(-1) ?? null;
}

// "R$ 1,80 por vida · sem prazo · vale desde out/2026"
export function ruleSentence(rule: RuleLike, today: string): string {
  const start = dateToCompetency(rule.valid_from);
  const term =
    rule.term_months === null ? "sem prazo" : `prazo de ${rule.term_months} meses por cliente`;
  const since =
    start <= today
      ? `vale desde ${shortCompetencyLabel(start)}`
      : `vale a partir de ${shortCompetencyLabel(start)}`;
  return `${formatCurrency(rule.value_per_life)} por vida · ${term} · ${since}`;
}
