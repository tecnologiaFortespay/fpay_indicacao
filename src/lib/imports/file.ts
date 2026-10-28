export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const FILE_NAME_PATTERN = /^[^/\\\x00-\x1f]{1,250}\.csv$/i;
const ACCEPTED_TYPES = [
  "",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
];

// Validates the uploaded file before any parsing. Throws a message in Portuguese for the form.
export function validateImportFile(name: string, type: string, size: number): void {
  if (!FILE_NAME_PATTERN.test(name)) {
    throw new Error("Envie um arquivo com extensão .csv e nome simples.");
  }
  if (!ACCEPTED_TYPES.includes(type)) {
    throw new Error("Tipo de arquivo não suportado. Envie o CSV exportado do BI.");
  }
  if (size === 0) {
    throw new Error("O arquivo está vazio.");
  }
  if (size > MAX_IMPORT_BYTES) {
    throw new Error("O arquivo passa de 5 MB.");
  }
}

// UTF-8 (with or without BOM); falls back to Windows-1252, common in exports from Windows tools.
export function decodeCsv(bytes: Uint8Array): string {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    content = new TextDecoder("windows-1252").decode(bytes);
  }
  return content.replace(/^﻿/, "");
}
