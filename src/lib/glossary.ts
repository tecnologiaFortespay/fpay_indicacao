// Glossário: o mesmo rótulo e a mesma ajuda em todos os formulários onde o campo aparece.
export const glossary = {
  valuePerLife: {
    label: "Valor por vida (R$)",
    hint: "Quanto o parceiro recebe por vida paga no mês. Ex.: 1,50",
  },
  validFrom: {
    label: "Vale a partir de",
    hint: "Mês em que esta regra começa, para quem for indicado a partir dele. Indicações anteriores seguem a regra de quando foram feitas. Meses já fechados não mudam.",
  },
  referralValidFrom: {
    label: "Vale a partir de",
    hint: "Mês a partir do qual esta indicação usa este valor e prazo. Meses já fechados não mudam.",
  },
  termMonths: {
    label: "Prazo (meses)",
    hint: "Em branco = sem prazo. Com prazo, cada cliente rende só os primeiros N meses depois do 1º pagamento (ex.: contador, 12).",
  },
  referralValue: {
    label: "Valor por vida desta indicação (R$)",
    hint: "Em branco, vale o valor da regra do parceiro. Preencha só se esta indicação foi combinada com outro valor.",
  },
  referralTerm: {
    label: "Prazo desta indicação (meses)",
    hint: "Em branco, vale o prazo da regra do parceiro. Com prazo, o cliente rende só os primeiros N meses depois do 1º pagamento.",
  },
} as const;
