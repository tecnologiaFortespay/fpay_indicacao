import { readCsv } from "./csv";
import { readFirstSheet } from "./xlsx";

// A Vercel recusa requisições acima de 4,5 MB; o export real do BI tem cerca de 200 KB.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

const FILE_NAME_PATTERN = /^[^/\\\x00-\x1f]{1,250}\.(xlsx|csv)$/i;
// O navegador informa o tipo como quiser (vazio, genérico); o que importa é casar com a extensão.
const XLSX_TYPES = [
  "",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
];
const CSV_TYPES = [
  "",
  "text/csv",
  "text/plain",
  "text/comma-separated-values",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

// Validates the uploaded file before any parsing. Throws a message in Portuguese for the form.
export function validateImportFile(name: string, type: string, size: number): void {
  if (!FILE_NAME_PATTERN.test(name)) {
    throw new Error(
      "Envie o arquivo do BI (Detalhamento Empresas) em .csv ou .xlsx, como ele é exportado.",
    );
  }
  const csv = /\.csv$/i.test(name);
  // CSV: cada sistema dá um nome ("text/csv", "text/x-csv", "application/vnd.ms-excel"…).
  const accepted = csv
    ? CSV_TYPES.includes(type) || type.startsWith("text/")
    : XLSX_TYPES.includes(type);
  if (!accepted) {
    throw new Error("Tipo de arquivo não suportado. Envie o arquivo do BI em .csv ou .xlsx.");
  }
  if (size === 0) {
    throw new Error("O arquivo está vazio.");
  }
  if (size > MAX_IMPORT_BYTES) {
    throw new Error("O arquivo passa de 4 MB.");
  }
}

// The grid of cells of the BI export, read as CSV or as the first sheet of the workbook.
export function readImportSheet(name: string, bytes: Uint8Array): string[][] {
  return /\.csv$/i.test(name) ? readCsv(bytes) : readFirstSheet(bytes);
}
