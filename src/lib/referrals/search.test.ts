import { describe, expect, it } from "vitest";
import { matchesReferralSearch } from "./search";

const farmacia = { company_name: "Farmácia São José Ltda", cnpj: "11222333000181" };

describe("busca de indicações por CNPJ ou empresa (lista do diretor)", () => {
  it("acha por trecho do nome, sem diferenciar maiúsculas nem acentos", () => {
    expect(matchesReferralSearch(farmacia, "sao jose")).toBe(true);
    expect(matchesReferralSearch(farmacia, "FARM")).toBe(true);
    expect(matchesReferralSearch(farmacia, "clínica")).toBe(false);
  });

  it("acha por CNPJ com ou sem pontuação, inteiro ou em parte", () => {
    expect(matchesReferralSearch(farmacia, "11.222.333/0001-81")).toBe(true);
    expect(matchesReferralSearch(farmacia, "222333")).toBe(true);
    expect(matchesReferralSearch(farmacia, "0001-81")).toBe(true);
    expect(matchesReferralSearch(farmacia, "99")).toBe(false);
  });

  it("CNPJ alfanumérico compara letras e números", () => {
    const alfa = { company_name: "Empresa Alfanumérica", cnpj: "12ABC34501DE35" };
    expect(matchesReferralSearch(alfa, "abc345")).toBe(true);
    expect(matchesReferralSearch(alfa, "12.ABC.345/01DE-35")).toBe(true);
  });

  it("busca vazia casa tudo", () => {
    expect(matchesReferralSearch(farmacia, "")).toBe(true);
    expect(matchesReferralSearch(farmacia, "   ")).toBe(true);
  });
});
