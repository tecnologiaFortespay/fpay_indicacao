import { formatCnpj, isValidCnpj, normalizeCnpj } from "@/lib/cnpj";

// Reads the "Detalhamento Empresas" export of the Fortes Pay BI (a Power BI matrix exported to
// Excel) as it is: one header row, subtotal rows ("Total") per group and per company, one row per
// CNPJ and a last "Filtros aplicados" row with the month filter. See docs/arquivo-bi.md.

export type ImportRow = {
  line_number: number;
  cnpj: string;
  competency: string;
  lives: number;
  company_name: string;
  group_name: string | null;
};

export type ImportIssue = {
  line_number: number;
  raw_line: string;
  outcome: "ignored" | "merged";
  reason: string;
};

export type ParsedExport = {
  rows: ImportRow[];
  issues: ImportIssue[];
  // Rows with a CNPJ; subtotals and the footer are structure, not data.
  rows_read: number;
  // "YYYY-MM-01" chosen by the user.
  competency: string;
  // Month found in the "Filtros aplicados" footer, when the export has one.
  filter_competency: string | null;
};

export class BiFormatError extends Error {}

// Column names as the BI writes them, compared without accents, case or repeated spaces.
// [CONFIRMAR] "vidas pagas no mês" = contas com cash-in no mês ("C. Cash-in"). Alternativa: "Contas Cad".
export const BI_COLUMNS = {
  cnpj: ["cnpj"],
  lives: ["c. cash-in", "c cash-in", "contas cash-in", "vidas"],
  company: ["nome_empresa", "nome empresa", "empresa", "razao social"],
  group: ["grupo empresarial", "grupo"],
};

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

type ColumnMap = {
  cnpj: number;
  lives: number;
  company: number | null;
  group: number | null;
};

function findColumn(header: string[], names: string[]): number | null {
  const index = header.findIndex((name) => names.includes(name));
  return index === -1 ? null : index;
}

export function mapColumns(rawHeader: string[]): ColumnMap {
  const header = rawHeader.map(normalizeText);
  const cnpj = findColumn(header, BI_COLUMNS.cnpj);
  const lives = findColumn(header, BI_COLUMNS.lives);
  const missing: string[] = [];
  if (cnpj === null) {
    missing.push("cnpj");
  }
  if (lives === null) {
    missing.push("C. Cash-in");
  }
  if (cnpj === null || lives === null) {
    throw new BiFormatError(
      `Não encontrei a(s) coluna(s) ${missing.join(", ")} no cabeçalho da planilha. Cabeçalho lido: ${rawHeader.filter(Boolean).join(" | ")}`,
    );
  }
  return {
    cnpj,
    lives,
    company: findColumn(header, BI_COLUMNS.company),
    group: findColumn(header, BI_COLUMNS.group),
  };
}

// "Filtros aplicados: … Ano é 2026 … Incluídos (1) outubro (Mês)" → "2026-10-01".
// Returns null when the footer does not name a single month; refuses more than one month.
export function parseFilters(text: string): string | null {
  const normalized = normalizeText(text);
  const year = normalized.match(/\bano e (\d{4})\b/)?.[1];
  const included = normalized.match(/incluidos \((\d+)\) (.+?) \(mes\)/);
  if (included && included[1] !== "1") {
    throw new BiFormatError(
      `O arquivo cobre ${included[1]} meses (${included[2]}). Exporte do BI um mês por vez.`,
    );
  }
  const monthName = included?.[2] ?? normalized.match(/\bmes e ([a-z]+)\b/)?.[1];
  if (!year || !monthName) {
    return null;
  }
  const month = MONTH_NAMES.indexOf(monthName.trim()) + 1;
  if (month === 0) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

// Integer ≥ 0 as Excel writes it ("2728", "2728.0"). A blank measure in the matrix means no
// account with cash-in, so it counts as zero.
export function parseLives(value: string): number | null {
  const text = value.trim().replace(/[.,]0+$/, "");
  if (text === "") {
    return 0;
  }
  if (!/^\d{1,7}$/.test(text)) {
    return null;
  }
  return Number(text);
}

function cell(cells: string[], index: number | null): string {
  if (index === null) {
    return "";
  }
  return cells[index] ?? "";
}

export function parseBiExport(sheet: string[][], competency: string): ParsedExport {
  const headerIndex = sheet.findIndex((row) => row.some((value) => value.trim() !== ""));
  if (headerIndex === -1) {
    throw new BiFormatError("A planilha está vazia.");
  }
  const columns = mapColumns(sheet[headerIndex] ?? []);
  const rowsByCnpj = new Map<string, ImportRow>();
  const issues: ImportIssue[] = [];
  let rowsRead = 0;
  let filterCompetency: string | null = null;
  for (let index = headerIndex + 1; index < sheet.length; index += 1) {
    const cells = sheet[index] ?? [];
    const lineNumber = index + 1;
    const firstCell = cell(cells, 0).trim();
    if (normalizeText(firstCell).startsWith("filtros aplicados")) {
      filterCompetency = parseFilters(firstCell);
      continue;
    }
    const cnpjText = cell(cells, columns.cnpj).trim();
    // Subtotal rows ("Total") and blank rows are structure, not data.
    if (cnpjText === "" || normalizeText(cnpjText) === "total") {
      continue;
    }
    rowsRead += 1;
    const rawLine = cells.join(";").slice(0, 4000);
    const cnpj = normalizeCnpj(cnpjText);
    if (!isValidCnpj(cnpj)) {
      issues.push({
        line_number: lineNumber,
        raw_line: rawLine,
        outcome: "ignored",
        reason: "CNPJ inválido.",
      });
      continue;
    }
    const lives = parseLives(cell(cells, columns.lives));
    if (lives === null) {
      issues.push({
        line_number: lineNumber,
        raw_line: rawLine,
        outcome: "ignored",
        reason: "Vidas inválidas (C. Cash-in).",
      });
      continue;
    }
    const companyName = cell(cells, columns.company).trim().slice(0, 240) || formatCnpj(cnpj);
    const groupName = cell(cells, columns.group).trim().slice(0, 240) || null;
    const existing = rowsByCnpj.get(cnpj);
    if (!existing) {
      rowsByCnpj.set(cnpj, {
        line_number: lineNumber,
        cnpj,
        competency,
        lives,
        company_name: companyName,
        group_name: groupName,
      });
      continue;
    }
    if (existing.lives === lives && existing.company_name === companyName) {
      issues.push({
        line_number: lineNumber,
        raw_line: rawLine,
        outcome: "merged",
        reason: "Linha idêntica repetida; contada uma vez.",
      });
      continue;
    }
    const previous = existing.lives;
    existing.lives += lives;
    issues.push({
      line_number: lineNumber,
      raw_line: rawLine,
      outcome: "merged",
      reason: `CNPJ repetido na planilha; vidas somadas (${previous} + ${lives} = ${existing.lives}).`,
    });
  }
  return {
    rows: Array.from(rowsByCnpj.values()),
    issues,
    rows_read: rowsRead,
    competency,
    filter_competency: filterCompetency,
  };
}
