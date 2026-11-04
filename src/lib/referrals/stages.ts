// Etapas da indicação, do jeito que o parceiro pergunta: "isso já rende?". As sete situações do
// banco se agrupam em três etapas; cada indicação ganha uma frase com o que está acontecendo.
import { formatDate, shortCompetencyLabel, dateToCompetency } from "@/lib/competency";
import type { ReferralStatus } from "@/lib/labels";
import { formatCurrency } from "@/lib/money";
import { termLabel } from "./config";

export type Stage = "not_earning" | "earning" | "closed";

export const stageLabels: Record<Stage, string> = {
  not_earning: "Ainda não rende",
  earning: "Rendendo comissão",
  closed: "Encerrada",
};

// Título de um grupo de indicações (listas e contadores): "Encerradas (2)".
export const stageGroupTitles: Record<Stage, string> = {
  ...stageLabels,
  closed: "Encerradas",
};

// Uma linha por etapa, para legendas e cabeçalhos.
export const stageDescriptions: Record<Stage, string> = {
  not_earning:
    "Indicada, em negociação ou com contrato fechado: começa a render quando o cliente pagar.",
  earning: "O cliente paga a Fortes Pay: cada vida paga no mês vira comissão.",
  closed: "Perdida ou cancelada: não rende mais. Meses já pagos continuam valendo.",
};

export const stageOrder: Stage[] = ["earning", "not_earning", "closed"];

const stageOf: Record<ReferralStatus, Stage> = {
  referred: "not_earning",
  negotiating: "not_earning",
  signed: "not_earning",
  active: "earning",
  delinquent: "earning",
  lost: "closed",
  cancelled: "closed",
};

export function referralStage(status: string): Stage {
  return stageOf[status as ReferralStatus] ?? "not_earning";
}

// Como o parceiro chama cada situação. "Fechada" vira "Contrato fechado" para não parecer que a
// comissão já está fechada.
export const partnerStatusNames: Record<ReferralStatus, string> = {
  referred: "Indicada",
  negotiating: "Em negociação",
  signed: "Contrato fechado",
  active: "Rendendo",
  delinquent: "Sem pagamento",
  lost: "Perdida",
  cancelled: "Cancelada",
};

// Cor do selo: verde rende, vermelho parou de pagar, âmbar a caminho, tracejado encerrada.
export function statusChipClass(status: string): string {
  switch (status) {
    case "active":
      return "fp-status fp-status-success";
    case "delinquent":
      return "fp-status fp-status-danger";
    case "negotiating":
    case "signed":
      return "fp-status fp-status-pending";
    case "lost":
    case "cancelled":
      return "fp-status fp-status-muted";
    default:
      return "fp-status";
  }
}

type ExplainInput = {
  status: string;
  created_at: string;
  status_changed_at: string | null;
  activated_competency: string | null;
};

type ExplainTerms = {
  valuePerLife: number | null;
  termMonths: number | null;
};

// Uma frase com o que está acontecendo com a indicação e o que falta para render.
export function referralExplanation(referral: ExplainInput, terms: ExplainTerms): string {
  const changed = referral.status_changed_at ?? referral.created_at;
  switch (referral.status) {
    case "referred":
      return `Indicada em ${formatDate(referral.created_at)}. A Fortes Pay ainda vai falar com o cliente; começa a render quando ele pagar.`;
    case "negotiating":
      return "Em negociação com o cliente. Começa a render quando ele fechar e pagar.";
    case "signed":
      return "Contrato fechado. Começa a render no primeiro mês em que o cliente pagar.";
    case "active": {
      const since = referral.activated_competency
        ? `Rende desde ${shortCompetencyLabel(dateToCompetency(referral.activated_competency))}`
        : "Rendendo";
      const value =
        terms.valuePerLife === null
          ? "sem regra de valor neste mês"
          : `${formatCurrency(terms.valuePerLife)} por vida`;
      return `${since} · ${value} · ${termLabel(terms.termMonths, referral.activated_competency)}.`;
    }
    case "delinquent":
      return "O cliente não pagou no último mês completo. Volta a render quando pagar de novo.";
    case "lost":
      return `Perdida em ${formatDate(changed)}: a negociação não fechou.`;
    case "cancelled":
      return `Cancelada em ${formatDate(changed)}: o cliente encerrou. Os meses anteriores continuam valendo.`;
    default:
      return "";
  }
}
