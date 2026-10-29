// Competência = mês de referência, "YYYY-MM" na interface e "YYYY-MM-01" no banco.
export const TIME_ZONE = "America/Fortaleza";

const COMPETENCY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isCompetency(value: unknown): value is string {
  return typeof value === "string" && COMPETENCY_PATTERN.test(value);
}

export function currentCompetency(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function addMonths(competency: string, months: number): string {
  const [year, month] = competency.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

// Envio feito depois que o mês terminou (calendário de Fortaleza) completa o mês; antes disso o
// arquivo é parcial. Mesmo critério do SQL (latest_complete_competency e prepare_closing).
export function completesMonth(importedAt: string | Date, competency: string): boolean {
  return currentCompetency(new Date(importedAt)) > competency;
}

export function previousCompetency(now: Date = new Date()): string {
  return addMonths(currentCompetency(now), -1);
}

export function competencyToDate(competency: string): string {
  return `${competency}-01`;
}

export function dateToCompetency(value: string): string {
  return value.slice(0, 7);
}

export function competencyLabel(competency: string): string {
  const [year, month] = competency.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

const SHORT_MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

// "2027-07" → "jul/2027".
export function shortCompetencyLabel(competency: string): string {
  const [year, month] = competency.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]}/${year}`;
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TIME_ZONE }).format(
    new Date(value),
  );
}

// Day of the month in Fortaleza, for "vidas até o dia N".
export function currentDayOfMonth(now: Date = new Date()): number {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, day: "numeric" }).format(now);
  return Number(day);
}
