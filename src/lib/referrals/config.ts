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
