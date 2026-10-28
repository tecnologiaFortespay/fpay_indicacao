import { describe, expect, it } from "vitest";
import { formatCurrency, formatInteger, parseMoneyInput } from "./money";

describe("money", () => {
  it("formats in Brazilian real", () => {
    expect(formatCurrency(72).replace(/ /g, " ")).toBe("R$ 72,00");
    expect(formatCurrency("1234.5").replace(/ /g, " ")).toBe("R$ 1.234,50");
    expect(formatCurrency(null)).toBe("—");
    expect(formatInteger(1234)).toBe("1.234");
  });

  it("parses what people type", () => {
    expect(parseMoneyInput("1,50")).toBe("1.50");
    expect(parseMoneyInput("R$ 2,00")).toBe("2.00");
    expect(parseMoneyInput("1.234,56")).toBe("1234.56");
    expect(parseMoneyInput("2")).toBe("2.00");
    expect(parseMoneyInput("-10,00")).toBe("-10.00");
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("1,234")).toBeNull();
  });
});
