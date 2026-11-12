import { describe, expect, it } from "vitest";
import { effectiveTerms, ownRuleOf, referralRuleSummary } from "./config";

const partnerRule = { value_per_life: 1.5, term_months: null, valid_from: "2026-08-01" };
// Vigência própria da indicação a partir de novembro (apontamento da área em 12/11/2026).
const november = { value_per_life: 2.5, term_months: 3, valid_from: "2026-11-01" };
const rules = new Map([["a", [november]]]);

describe("ownRuleOf", () => {
  it("antes do início da vigência, a indicação segue a regra do parceiro", () => {
    expect(ownRuleOf(rules, "a", "2026-09")).toBeNull();
    expect(effectiveTerms(ownRuleOf(rules, "a", "2026-09"), partnerRule)).toEqual({
      valuePerLife: 1.5,
      termMonths: null,
    });
  });

  it("a partir do mês da vigência, vale a própria", () => {
    expect(ownRuleOf(rules, "a", "2026-11")).toBe(november);
    expect(ownRuleOf(rules, "a", "2026-12")).toBe(november);
  });

  it("entre duas vigências, vale a mais recente já começada", () => {
    const august = { value_per_life: 2, term_months: null, valid_from: "2026-08-01" };
    const both = new Map([["a", [november, august]]]);
    expect(ownRuleOf(both, "a", "2026-10")).toBe(august);
  });
});

describe("referralRuleSummary", () => {
  it("mês anterior à vigência: regra do parceiro, com o aviso do que muda e quando", () => {
    const summary = referralRuleSummary([november], "2026-09");
    expect(summary.label).toBe("regra do parceiro");
    expect(summary.note).toMatch(/^a partir de nov\/2026: R\$\s2,50 por vida · 3 meses$/);
  });

  it("mês dentro da vigência: o valor próprio e desde quando vale", () => {
    const summary = referralRuleSummary([november], "2026-11");
    expect(summary.label).toMatch(/^R\$\s2,50 por vida · 3 meses$/);
    expect(summary.note).toBe("desde nov/2026");
  });

  it("sem vigência própria: só a regra do parceiro", () => {
    expect(referralRuleSummary([], "2026-11")).toEqual({ label: "regra do parceiro", note: null });
  });
});
