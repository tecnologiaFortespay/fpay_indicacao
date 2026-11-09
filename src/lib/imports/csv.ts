import { BiFormatError } from "./bi";

// Reads the BI export saved as CSV (the "Detalhamento Empresas" matrix opened in Google Sheets or
// Excel and downloaded as .csv) into the same grid of cells the .xlsx reader returns. Handles
// quoted cells with commas and line breaks (the "Filtros aplicados" footer is one multi-line
// cell), "" escapes, a UTF-8 BOM, the ";" separator of Excel in Portuguese and files saved as
// Windows-1252 instead of UTF-8.

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// The separator is whichever of "," and ";" appears more in the header line, outside quotes.
function detectSeparator(text: string): string {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === "\n" || char === "\r")) {
      break;
    } else if (!quoted && char === ",") {
      commas += 1;
    } else if (!quoted && char === ";") {
      semicolons += 1;
    }
  }
  return semicolons > commas ? ";" : ",";
}

export function readCsv(bytes: Uint8Array): string[][] {
  const text = decode(bytes).replace(/^﻿/, "");
  if (text.trim() === "") {
    throw new BiFormatError("O arquivo está vazio.");
  }
  const separator = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"' && value === "") {
      quoted = true;
    } else if (char === separator) {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (quoted) {
    throw new BiFormatError("O arquivo CSV está incompleto: uma célula entre aspas não termina.");
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  if (rows.length > 50_000) {
    throw new BiFormatError("O arquivo passa de 50.000 linhas.");
  }
  return rows;
}
