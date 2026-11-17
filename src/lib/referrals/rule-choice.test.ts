import { describe, expect, it } from "vitest";
import {
  automaticRuleMonth,
  partnerRuleFor,
  referenceMonth,
  ruleChoice,
  ruleChoiceLabel,
} from "./rule-choice";

// Parceiro com R$ 1,00 e prazo de 12 meses desde junho e R$ 2,00 sem prazo desde outubro.
const june = { value_per_life: 1, term_months: 12, valid_from: "2026-06-01" };
const october = { value_per_life: 2, term_months: null, valid_from: "2026-10-01" };
const rules = [october, june];

describe("automaticRuleMonth", () => {
  it("é o mês em que a indicação foi feita, no calendário de Fortaleza", () => {
    expect(automaticRuleMonth("2026-10-05T12:00:00Z", null)).toBe("2026-10");
    // 01:30 UTC de 1º de novembro ainda é 31 de outubro em Fortaleza.
    expect(automaticRuleMonth("2026-11-01T01:30:00Z", null)).toBe("2026-10");
  });

  it("empresa que já pagava antes usa o mês do primeiro pagamento", () => {
    expect(automaticRuleMonth("2026-11-05T12:00:00Z", "2026-08-01")).toBe("2026-08");
    expect(automaticRuleMonth("2026-09-05T12:00:00Z", "2026-11-01")).toBe("2026-09");
  });
});

describe("referenceMonth", () => {
  it("o mês escolhido pelo diretor manda sobre o automático", () => {
    const referral = { created_at: "2026-10-05T12:00:00Z", first_cashin: null };
    expect(referenceMonth({ ...referral, rule_month: null })).toBe("2026-10");
    expect(referenceMonth({ ...referral, rule_month: "2026-06-01" })).toBe("2026-06");
  });
});

describe("partnerRuleFor", () => {
  it("vale a vigência mais recente que já existia no mês de referência", () => {
    expect(partnerRuleFor(rules, "2026-09", "2026-10")).toBe(june);
    expect(partnerRuleFor(rules, "2026-10", "2026-10")).toBe(october);
    expect(partnerRuleFor(rules, "2026-12", "2026-12")).toBe(october);
  });

  it("uma vigência nunca vale antes do mês em que começa", () => {
    expect(partnerRuleFor(rules, "2026-10", "2026-09")).toBe(june);
    expect(partnerRuleFor(rules, "2026-10", "2026-05")).toBeNull();
  });

  it("indicação anterior a qualquer vigência usa a primeira que passou a valer", () => {
    expect(partnerRuleFor(rules, "2026-03", "2026-11")).toBe(june);
  });
});

describe("ruleChoice", () => {
  const referral = { created_at: "2026-10-05T12:00:00Z", first_cashin: null, rule_month: null };

  it("sem escolha, a opção marcada é a automática e ela diz qual vigência aplica", () => {
    const choice = ruleChoice(referral, rules, "2026-10");
    expect(choice.selected).toBe("");
    expect(choice.applied).toBe(october);
    // O "R$" vem com espaço não separável; normalizado para comparar.
    const options = choice.options.map(([value, text]) => [value, text.replace(/ /g, " ")]);
    expect(options).toEqual([
      ["", "Automática (out/2026 · R$ 2,00 · sem prazo)"],
      ["2026-06", "Vigência de jun/2026 · R$ 1,00 · 12 meses"],
      ["2026-10", "Vigência de out/2026 · R$ 2,00 · sem prazo"],
    ]);
  });

  it("com a vigência de junho escolhida, é ela que vale em outubro", () => {
    const choice = ruleChoice({ ...referral, rule_month: "2026-06-01" }, rules, "2026-10");
    expect(choice.selected).toBe("2026-06");
    expect(choice.applied).toBe(june);
    // A opção automática continua dizendo o que valeria sem a escolha.
    expect(choice.options[0][1]).toContain("out/2026");
  });

  it("vigência escolhida que foi removida depois volta a aparecer como automática", () => {
    const choice = ruleChoice({ ...referral, rule_month: "2026-08-01" }, rules, "2026-10");
    expect(choice.selected).toBe("");
    // O cálculo segue o mês guardado: a mais recente que já existia em agosto.
    expect(choice.applied).toBe(june);
  });

  it("parceiro sem vigência em vigor no mês não tem regra aplicada", () => {
    const choice = ruleChoice(referral, rules, "2026-05");
    expect(choice.applied).toBeNull();
    expect(choice.options[0]).toEqual(["", "Automática"]);
  });
});

describe("ruleChoiceLabel", () => {
  it("descreve a vigência pelo mês de início, valor e prazo", () => {
    expect(ruleChoiceLabel(june).replace(/ /g, " ")).toBe(
      "vigência de jun/2026: R$ 1,00 por vida · 12 meses",
    );
  });
});
