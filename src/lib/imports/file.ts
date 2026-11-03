// A Vercel recusa requisições acima de 4,5 MB; o export real do BI tem cerca de 150 KB.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

const FILE_NAME_PATTERN = /^[^/\\\x00-\x1f]{1,250}\.xlsx$/i;
const ACCEPTED_TYPES = [
  "",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
];

// Validates the uploaded file before any parsing. Throws a message in Portuguese for the form.
export function validateImportFile(name: string, type: string, size: number): void {
  if (!FILE_NAME_PATTERN.test(name)) {
    throw new Error("Envie a planilha .xlsx exportada do BI (Detalhamento Empresas).");
  }
  if (!ACCEPTED_TYPES.includes(type)) {
    throw new Error("Tipo de arquivo não suportado. Envie a planilha .xlsx exportada do BI.");
  }
  if (size === 0) {
    throw new Error("O arquivo está vazio.");
  }
  if (size > MAX_IMPORT_BYTES) {
    throw new Error("O arquivo passa de 4 MB.");
  }
}
