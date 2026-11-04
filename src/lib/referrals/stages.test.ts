import { describe, expect, it } from "vitest";
import { referralExplanation, referralStage, statusChipClass } from "./stages";

const base = {
  created_at: "2026-09-02T12:00:00Z",
  status_changed_at: "2026-10-05T12:00:00Z",
  activated_competency: "2026-08-01",
};

describe("etapas da indicação", () => {
  it("agrupa as sete situações em três etapas", () => {
    expect(["referred", "negotiating", "signed"].map(referralStage)).toEqual([
      "not_earning",
      "not_earning",
      "not_earning",
    ]);
    expect(["active", "delinquent"].map(referralStage)).toEqual(["earning", "earning"]);
    expect(["lost", "cancelled"].map(referralStage)).toEqual(["closed", "closed"]);
  });

  it("explica em uma frase quando a indicação rende", () => {
    const terms = { valuePerLife: 1.5, termMonths: 12 };
    expect(referralExplanation({ ...base, status: "signed" }, terms)).toBe(
      "Contrato fechado. Começa a render no primeiro mês em que o cliente pagar.",
    );
    expect(referralExplanation({ ...base, status: "active" }, terms)).toMatch(
      /^Rende desde ago\/2026 · R\$\s1,50 por vida · 12 meses: ago\/2026 a jul\/2027\.$/,
    );
    expect(
      referralExplanation({ ...base, status: "active" }, { valuePerLife: null, termMonths: null }),
    ).toBe("Rende desde ago/2026 · sem regra de valor neste mês · sem prazo.");
    expect(referralExplanation({ ...base, status: "cancelled" }, terms)).toBe(
      "Cancelada em 05/10/2026: o cliente encerrou. Os meses anteriores continuam valendo.",
    );
    expect(referralExplanation({ ...base, status: "referred" }, terms)).toMatch(
      /^Indicada em 02\/09\/2026\./,
    );
  });

  it("dá cor pelo que acontece: verde rende, vermelho parou, tracejado encerrou", () => {
    expect(statusChipClass("active")).toContain("success");
    expect(statusChipClass("delinquent")).toContain("danger");
    expect(statusChipClass("signed")).toContain("pending");
    expect(statusChipClass("lost")).toContain("muted");
    expect(statusChipClass("referred")).toBe("fp-status");
  });
});
