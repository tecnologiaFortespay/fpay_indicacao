import { formatCnpj, isValidCnpj, normalizeCnpj } from "@/lib/cnpj";

// Reads the BI export as it is. Column names are a hypothesis until the real file arrives
// (docs/csv-bi.md); only this file and its tests change when it does.

export type ImportRow = {
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

export type ParsedImport = {
  rows: ImportRow[];
  issues: ImportIssue[];
  rows_read: number;
  competencies: string[];
};

type ColumnMap = {
  cnpj: number;
  lives: number;
  month: number;
  company: number | null;
  group: number | null;
};

export class CsvFormatError extends Error {}

export function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/"/g, "").trim();
}

export function detectDelimiter(headerLine: string): ";" | "," {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return commas > semicolons ? "," : ";";
}

// Splits one line respecting double quotes ("" inside quotes is an escaped quote).
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function findColumn(header: string[], matches: (name: string) => boolean): number | null {
  const index = header.findIndex((name) => matches(name));
  return index === -1 ? null : index;
}

export function mapColumns(rawHeader: string[]): ColumnMap {
  const header = rawHeader.map(normalizeHeader);
  const cnpj = findColumn(header, (name) => name.includes("cnpj"));
  const lives = findColumn(header, (name) => name.includes("vida"));
  const month = findColumn(
    header,
    (name) =>
      name.includes("competencia") ||
      name === "mes" ||
      name.startsWith("mes ") ||
      name.includes("mes/") ||
      name.includes("mes_") ||
      name.endsWith("mes"),
  );
  const company = findColumn(
    header,
    (name) =>
      name.includes("empresa") ||
      name.includes("razao") ||
      name.includes("cliente") ||
      name.includes("nome"),
  );
  const group = findColumn(header, (name) => name.includes("grupo"));
  const missing: string[] = [];
  if (cnpj === null) {
    missing.push("CNPJ");
  }
  if (lives === null) {
    missing.push("vidas");
  }
  if (month === null) {
    missing.push("mês");
  }
  if (missing.length > 0) {
    throw new CsvFormatError(
      `Não encontrei a(s) coluna(s) ${missing.join(", ")} no cabeçalho do arquivo. Cabeçalho lido: ${rawHeader.join(" | ")}`,
    );
  }
  return { cnpj: cnpj as number, lives: lives as number, month: month as number, company, group };
}

const MONTH_PATTERNS: { pattern: RegExp; year: number; month: number }[] = [
  { pattern: /^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:[ T].*)?$/, year: 1, month: 2 },
  { pattern: /^(\d{4})\/(\d{1,2})(?:\/\d{1,2})?$/, year: 1, month: 2 },
  { pattern: /^(\d{1,2})\/(\d{4})$/, year: 2, month: 1 },
  { pattern: /^(\d{1,2})-(\d{4})$/, year: 2, month: 1 },
  { pattern: /^\d{1,2}\/(\d{1,2})\/(\d{4})(?:[ T].*)?$/, year: 2, month: 1 },
];

// Returns "YYYY-MM-01" or null when the month is not recognizable.
export function parseMonth(value: string): string | null {
  const text = value.trim();
  for (const candidate of MONTH_PATTERNS) {
    const match = text.match(candidate.pattern);
    if (!match) {
      continue;
    }
    const year = Number(match[candidate.year]);
    const month = Number(match[candidate.month]);
    if (year < 2000 || year > 2100 || month < 1 || month > 12) {
      return null;
    }
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }
  return null;
}

// Accepts "48", "1234", "1.234" (thousands separator) and "48,0"; rejects anything else.
export function parseLives(value: string): number | null {
  const text = value.trim().replace(/,0+$/, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    return Number(text.replace(/\./g, ""));
  }
  if (/^\d{1,7}$/.test(text)) {
    return Number(text);
  }
  return null;
}

function cell(cells: string[], index: number | null): string {
  if (index === null) {
    return "";
  }
  return cells[index] ?? "";
}

export function parseBiCsv(content: string): ParsedImport {
  const lines = content.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  if (headerIndex === -1) {
    throw new CsvFormatError("O arquivo está vazio.");
  }
  const delimiter = detectDelimiter(lines[headerIndex]);
  const columns = mapColumns(splitCsvLine(lines[headerIndex], delimiter));
  const rowsByKey = new Map<string, ImportRow>();
  const issues: ImportIssue[] = [];
  let rowsRead = 0;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (rawLine.trim() === "") {
      continue;
    }
    rowsRead += 1;
    const lineNumber = index + 1;
    const cells = splitCsvLine(rawLine, delimiter);
    const cnpj = normalizeCnpj(cell(cells, columns.cnpj));
    if (!isValidCnpj(cnpj)) {
      issues.push({
        line_number: lineNumber,
        raw_line: rawLine,
        outcome: "ignored",
        reason: "CNPJ inválido.",
      });
      continue;
    }
    const competency = parseMonth(cell(cells, columns.month));
    if (competency === null) {
      issues.push({
        line_number: lineNumber,
        raw_line: rawLine,
        outcome: "ignored",
        reason: "Mês não reconhecido.",
      });
      continue;
    }
    const lives = parseLives(cell(cells, columns.lives));
    if (lives === null) {
      issues.push({
        line_number: lineNumber,
        raw_line: rawLine,
        outcome: "ignored",
        reason: "Vidas inválidas.",
      });
      continue;
    }
    const companyName = cell(cells, columns.company).slice(0, 240) || formatCnpj(cnpj);
    const groupName = cell(cells, columns.group).slice(0, 240) || null;
    const key = `${cnpj}|${competency}`;
    const existing = rowsByKey.get(key);
    if (!existing) {
      rowsByKey.set(key, {
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
      reason: `CNPJ repetido no mesmo mês; vidas somadas (${previous} + ${lives} = ${existing.lives}).`,
    });
  }
  const rows = Array.from(rowsByKey.values());
  const competencies = Array.from(new Set(rows.map((row) => row.competency))).sort();
  return { rows, issues, rows_read: rowsRead, competencies };
}
