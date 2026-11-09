import { strToU8, zipSync } from "fflate";

// Builds an .xlsx in the shape of the BI export "Detalhamento Empresas" (Power BI matrix):
// header, subtotal rows per group and per company, one row per CNPJ, and the "Filtros aplicados"
// footer with the month filter. Used by the unit tests of the reader and by the e2e uploads.

export type ExportRow = {
  cnpj: string;
  company: string;
  lives: number | string;
  group?: string;
};

export type ExportOptions = {
  // Several months in the footer: an export the platform must refuse.
  months?: string[];
  // Replaces the real header, to test missing columns.
  header?: string[];
  // Shared strings and cell references, as Excel writes when the file is re-saved.
  excelStyle?: boolean;
};

export const BI_HEADER = [
  "Grupo Empresarial",
  "nome_empresa",
  "cnpj",
  "Empresas",
  "Prim cashin",
  "Faturamento",
  "Emp. Cash-in",
  "Fat. /Empresa",
  "Contas Cad",
  "C. Cash-in",
  "Fat./conta",
  "Novas contas",
  "Volume Cash-in",
  "Cliente SE",
  "Vol SE",
  "Inadimp.",
  "Custos Onboard.",
];

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
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

type Cell = string | number | null;

const SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function footer(months: string[]): string | null {
  if (months.length === 0) {
    return null;
  }
  const year = months[0]!.slice(0, 4);
  const names = months.map((month) => MONTH_NAMES[Number(month.slice(5, 7)) - 1]);
  return `Filtros aplicados:\r\nconvenio é Fortespay\r\nAno é ${year}\r\nIncluídos (${names.length}) ${names.join(", ")} (Mês)\r\nconvenio é Fortespay\r\nconvenio é Fortespay`;
}

// Numeric columns other than "C. Cash-in" carry plausible values; the parser ignores them.
function measures(lives: number | string): Cell[] {
  return [1, 44497.660049733793, 1000.5, 1, 1000.5, 10, lives, 81.7, 1, 5000.25, 3, 100, 0, null];
}

function sheetRows(rows: ExportRow[], months: string[], header: string[]): Cell[][] {
  const out: Cell[][] = [header];
  const groups = new Set<string>();
  for (const row of rows) {
    const group = row.group ?? row.company;
    if (!groups.has(group)) {
      groups.add(group);
      out.push([group, "Total", null, ...measures(8)]);
    }
    out.push([group, row.company, "Total", ...measures(8)]);
    out.push([group, row.company, row.cnpj, ...measures(row.lives)]);
  }
  const filters = footer(months);
  if (filters) {
    out.push([filters]);
  }
  return out;
}

function columnLetters(index: number): string {
  let letters = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    current = Math.floor((current - 1) / 26);
  }
  return letters;
}

// Power BI style: "x:" prefix, inline strings, no cell references, empty cells kept.
function powerBiSheet(rows: Cell[][]): string {
  const body = rows
    .map((cells) => {
      const xml = cells
        .map((value) => {
          if (value === null) {
            return '<x:c s="4" />';
          }
          if (typeof value === "number") {
            return `<x:c s="1"><x:v>${value}</x:v></x:c>`;
          }
          return `<x:c s="6" t="inlineStr"><x:is><x:t>${escapeXml(value)}</x:t></x:is></x:c>`;
        })
        .join("");
      return `<x:row>${xml}</x:row>`;
    })
    .join("");
  return `﻿<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="${SPREADSHEET_NS}"><x:sheetData>${body}</x:sheetData></x:worksheet>`;
}

// Excel style: default namespace, shared strings, cell references, empty cells left out.
function excelSheet(rows: Cell[][]): { sheet: string; sharedStrings: string } {
  const strings: string[] = [];
  const body = rows
    .map((cells, rowIndex) => {
      const xml = cells
        .map((value, columnIndex) => {
          if (value === null) {
            return "";
          }
          const reference = `${columnLetters(columnIndex)}${rowIndex + 1}`;
          if (typeof value === "number") {
            return `<c r="${reference}"><v>${value}</v></c>`;
          }
          strings.push(value);
          return `<c r="${reference}" t="s"><v>${strings.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${xml}</row>`;
    })
    .join("");
  const items = strings
    .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
    .join("");
  return {
    sheet: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${SPREADSHEET_NS}"><sheetData>${body}</sheetData></worksheet>`,
    sharedStrings: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${SPREADSHEET_NS}" count="${strings.length}" uniqueCount="${strings.length}">${items}</sst>`,
  };
}

// month: "YYYY-MM" written to the footer; null leaves the footer out.
export function biExport(rows: ExportRow[], month: string | null, options: ExportOptions = {}) {
  const months = options.months ?? (month === null ? [] : [month]);
  const cells = sheetRows(rows, months, options.header ?? BI_HEADER);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PACKAGE_NS}"><Relationship Id="rId1" Type="${RELATIONSHIPS_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
  };
  if (options.excelStyle) {
    const { sheet, sharedStrings } = excelSheet(cells);
    files["xl/workbook.xml"] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIPS_NS}"><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    );
    files["xl/_rels/workbook.xml.rels"] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_NS}"><Relationship Id="rId1" Type="${RELATIONSHIPS_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RELATIONSHIPS_NS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    );
    files["xl/worksheets/sheet1.xml"] = strToU8(sheet);
    files["xl/sharedStrings.xml"] = strToU8(sharedStrings);
  } else {
    files["xl/workbook.xml"] = strToU8(
      `﻿<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:x="${SPREADSHEET_NS}"><x:sheets><x:sheet name="Export" sheetId="1" r:id="Rb5f9684781f943c3" xmlns:r="${RELATIONSHIPS_NS}" /></x:sheets></x:workbook>`,
    );
    files["xl/_rels/workbook.xml.rels"] = strToU8(
      `﻿<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${PACKAGE_NS}"><Relationship Type="${RELATIONSHIPS_NS}/worksheet" Target="/xl/worksheets/sheet1.xml" Id="Rb5f9684781f943c3" /></Relationships>`,
    );
    files["xl/worksheets/sheet1.xml"] = strToU8(powerBiSheet(cells));
  }
  return zipSync(files, { level: 6 });
}

export type CsvOptions = {
  // ";" is what Excel in Portuguese writes; Google Sheets writes ",".
  separator?: "," | ";";
  // Excel in Portuguese saves CSV as Windows-1252; Google Sheets as UTF-8.
  latin1?: boolean;
};

const integerFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function csvLives(lives: number | string): string {
  return typeof lives === "number" ? integerFormat.format(lives) : lives;
}

// Measures as Google Sheets shows them: "1.000", "R$ 5.906", "R$ 41,60"; "C. Cash-in" in the 10th column.
function csvMeasures(lives: number | string): string[] {
  return [
    "1",
    "mar./ 26",
    "R$ 1.000",
    "1",
    "R$ 1.000",
    "1.017",
    csvLives(lives),
    "R$ 81,70",
    "1",
    "R$ 5.000",
    "3",
    "R$ 100",
    "",
    "",
  ];
}

function csvCell(value: string, separator: string): string {
  return /["\r\n]/.test(value) || value.includes(separator)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes[index] = code < 256 ? code : 63;
  }
  return bytes;
}

// The same matrix saved as CSV, the way it arrives from Google Sheets ("Planilha sem título -
// Export.csv"): group and company names only on their subtotal rows (blank on the CNPJ rows),
// numbers formatted in Portuguese, a grand total, a blank row and the multi-line "Filtros
// aplicados" footer in one quoted cell.
export function biExportCsv(rows: ExportRow[], month: string | null, options: CsvOptions = {}) {
  const separator = options.separator ?? ",";
  const out: string[][] = [BI_HEADER];
  const blank = Array(BI_HEADER.length - 3).fill("");
  let lastGroup: string | null = null;
  for (const row of rows) {
    const group = row.group ?? row.company;
    if (group !== lastGroup) {
      lastGroup = group;
      out.push([group, "Total", "", ...csvMeasures(8)]);
    }
    out.push(["", row.company, "Total", ...csvMeasures(8)]);
    out.push(["", "", row.cnpj, ...csvMeasures(row.lives)]);
  }
  out.push(["Total", "", "", ...csvMeasures(99)]);
  out.push(["", "", "", ...blank]);
  const filters = footer(month === null ? [] : [month]);
  if (filters) {
    out.push([filters.replace(/\r\n/g, "\n"), "", "", ...blank]);
  }
  const text = out
    .map((cells) => cells.map((cell) => csvCell(cell, separator)).join(separator))
    .join("\r\n");
  return options.latin1 ? latin1Bytes(text) : new TextEncoder().encode(text);
}
