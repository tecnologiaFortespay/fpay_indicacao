// Telefone brasileiro com DDD: celular "(86) 99999-0000" (11 dígitos) ou fixo "(86) 3222-0000" (10).

function phoneDigits(text: string): string {
  return text.replace(/\D/g, "").slice(0, 11);
}

// Formata o que já foi digitado, para a máscara acompanhar a digitação.
export function formatPhone(text: string): string {
  const digits = phoneDigits(text);
  if (digits.length <= 2) {
    return digits === "" ? "" : `(${digits}`;
  }
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) {
    return `(${area}) ${number}`;
  }
  const split = number.length === 9 ? 5 : 4;
  return `(${area}) ${number.slice(0, split)}-${number.slice(split)}`;
}

export function isCompletePhone(text: string): boolean {
  const { length } = phoneDigits(text);
  return length === 10 || length === 11;
}
