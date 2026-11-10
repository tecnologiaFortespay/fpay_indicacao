// Textos de interface em português, centralizados por domínio.
export const roleLabels = {
  director: "Diretor",
  partner: "Parceiro",
} as const;

export const partnerKindLabels = {
  unit: "Unidade",
  external: "Parceiro externo",
} as const;

// Tipos de convite: os de parceiro mais o de diretor (Equipe).
export const invitationKindLabels = {
  ...partnerKindLabels,
  director: "Diretor",
} as const;

export const partnerStatusLabels = {
  pending: "Aguardando aprovação",
  active: "Ativo",
  rejected: "Recusado",
} as const;

export const referralStatusLabels = {
  referred: "Indicada",
  negotiating: "Em negociação",
  signed: "Fechada",
  active: "Ativa",
  delinquent: "Inadimplente",
  lost: "Perdida",
  cancelled: "Cancelada",
} as const;

export const importOutcomeLabels = {
  ignored: "Ignorada",
  merged: "Mesclada",
} as const;

export type Role = keyof typeof roleLabels;
export type PartnerKind = keyof typeof partnerKindLabels;
export type PartnerStatus = keyof typeof partnerStatusLabels;
export type ReferralStatus = keyof typeof referralStatusLabels;

export const invitationStatusLabels = {
  open: "Aguardando cadastro",
  used: "Cadastro feito",
  expired: "Expirado",
} as const;

export const closingStatusLabels = {
  open: "Em preparação",
  closed: "Fechado",
} as const;

export const decisionLabels = {
  pay: "Pagar",
  accumulate: "Acumular",
} as const;

// Como o parceiro lê a decisão do fechamento.
export const partnerDecisionLabels = {
  pay: "Pagar",
  accumulate: "Acumulado para o próximo mês",
} as const;

export const partnerResponseLabels = {
  confirmed: "Confirmado",
  disputed: "Contestado",
} as const;
