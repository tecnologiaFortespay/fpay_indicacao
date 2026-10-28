import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "./cnpj";

describe("cnpj", () => {
  it("validates check digits", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("00000000000191")).toBe(true);
    expect(isValidCnpj("11222333000180")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
  });

  it("validates the alphanumeric format in force since July 2026", () => {
    // Base "12ABC34501DE" with digits computed by the official algorithm (ASCII − 48).
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
    expect(isValidCnpj("12abc34501de35")).toBe(false);
  });

  it("normalizes and formats", () => {
    expect(normalizeCnpj(" 11.222.333/0001-81 ")).toBe("11222333000181");
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
