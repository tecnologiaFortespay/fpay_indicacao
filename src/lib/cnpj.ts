// CNPJ alfanumérico (vigente desde julho de 2026): 12 caracteres [A-Z0-9] + 2 dígitos verificadores.
// O valor de cada caractere é o código ASCII menos 48; dígitos continuam valendo o próprio número.
const CNPJ_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/;
const REPEATED_DIGITS = /^(\d)\1{13}$/;

export function normalizeCnpj(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function checkDigit(base: string): number {
  let weight = 2;
  let total = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    total += (base.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string): boolean {
  if (!CNPJ_PATTERN.test(value)) {
    return false;
  }
  if (REPEATED_DIGITS.test(value)) {
    return false;
  }
  const base = value.slice(0, 12);
  const first = checkDigit(base);
  const second = checkDigit(base + String(first));
  return value === base + String(first) + String(second);
}

export function formatCnpj(value: string): string {
  if (value.length !== 14) {
    return value;
  }
  const part1 = value.slice(0, 2);
  const part2 = value.slice(2, 5);
  const part3 = value.slice(5, 8);
  const part4 = value.slice(8, 12);
  const digits = value.slice(12, 14);
  return `${part1}.${part2}.${part3}/${part4}-${digits}`;
}

// Completa uma base de 12 caracteres com os dois dígitos verificadores (útil em testes e fixtures).
export function cnpjWithDigits(base: string): string {
  const normalized = normalizeCnpj(base).slice(0, 12);
  const first = checkDigit(normalized);
  const second = checkDigit(normalized + String(first));
  return normalized + String(first) + String(second);
}
