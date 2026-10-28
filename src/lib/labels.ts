// Textos de interface em português, centralizados por domínio.
export const roleLabels = {
  director: "Diretor",
  analyst: "Analista de dados",
  partner: "Parceiro",
} as const;

export const partnerKindLabels = {
  unit: "Unidade",
  external: "Indicador externo",
} as const;

export const partnerStatusLabels = {
  pending: "Aguardando aprovação",
  active: "Ativo",
  rejected: "Recusado",
} as const;

export const paymentMethodLabels = {
  card: "Cartão (crédito na plataforma Fortes Pay)",
  pix: "PIX",
  bank_transfer: "Depósito / transferência bancária",
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
export type PaymentMethod = keyof typeof paymentMethodLabels;
export type ReferralStatus = keyof typeof referralStatusLabels;
