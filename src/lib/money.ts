const currencyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integerFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return currencyFormat.format(Number(value));
}

export function formatInteger(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return integerFormat.format(Number(value));
}

// Accepts "1,50", "1.50", "R$ 1,50" and returns a string with a dot and two decimals for SQL.
export function parseMoneyInput(input: string): string | null {
  const cleaned = input.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const normalized = cleaned.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Number(normalized).toFixed(2);
}
