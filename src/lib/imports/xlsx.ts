import { strFromU8, unzipSync } from "fflate";

// Minimal reader for the first worksheet of an .xlsx file. Enough for the BI export (inline
// strings, cells without references) and for the same file re-saved by Excel (shared strings,
// cell references with gaps). Values come back as the text stored in the file: numbers keep the
// digits Excel wrote and dates stay as serial numbers.

export class WorkbookError extends Error {}

const MAX_ROWS = 60000;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const NEEDED_ENTRIES =
  /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/;

// Optional namespace prefix, as in "<x:row>".
const PREFIX = "(?:[A-Za-z0-9_-]+:)?";
const ROW = new RegExp(`<${PREFIX}row\\b[^>]*?(?:/>|>([\\s\\S]*?)</${PREFIX}row>)`, "g");
const CELL = new RegExp(`<${PREFIX}c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${PREFIX}c>)`, "g");
const TEXT = new RegExp(`<${PREFIX}t\\b[^>]*>([\\s\\S]*?)</${PREFIX}t>`, "g");
const VALUE = new RegExp(`<${PREFIX}v>([\\s\\S]*?)</${PREFIX}v>`);
const SHARED_ITEM = new RegExp(`<${PREFIX}si\\b[^>]*>([\\s\\S]*?)</${PREFIX}si>`, "g");

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Rich text comes in several <t> runs; plain text in one.
function runsText(xml: string): string {
  let text = "";
  for (const match of xml.matchAll(TEXT)) {
    text += decodeEntities(match[1] ?? "");
  }
  return text;
}

function readSharedStrings(xml: string): string[] {
  return Array.from(xml.matchAll(SHARED_ITEM), (match) => runsText(match[1] ?? ""));
}

// "A" → 0, "Z" → 25, "AA" → 26.
function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function cellText(attributes: string, inner: string, sharedStrings: string[]): string {
  const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "n";
  if (type === "inlineStr") {
    return runsText(inner);
  }
  const value = inner.match(VALUE)?.[1];
  if (value === undefined) {
    return "";
  }
  if (type === "s") {
    return sharedStrings[Number(value)] ?? "";
  }
  return decodeEntities(value).trim();
}

function readRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(ROW)) {
    if (rows.length >= MAX_ROWS) {
      throw new WorkbookError(`A planilha passa de ${MAX_ROWS} linhas.`);
    }
    const cells: string[] = [];
    let next = 0;
    for (const cell of (row[1] ?? "").matchAll(CELL)) {
      const attributes = cell[1] ?? "";
      const reference = attributes.match(/\br="([A-Z]+)\d+"/)?.[1];
      const index = reference ? columnIndex(reference) : next;
      while (cells.length < index) {
        cells.push("");
      }
      cells[index] = cellText(attributes, cell[2] ?? "", sharedStrings);
      next = index + 1;
    }
    rows.push(cells);
  }
  return rows;
}

// Follows workbook.xml → workbook.xml.rels to the first sheet; falls back to the usual path.
function firstSheetPath(files: Record<string, Uint8Array>): string {
  const fallback = "xl/worksheets/sheet1.xml";
  const workbook = files["xl/workbook.xml"];
  const relationships = files["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) {
    return fallback;
  }
  const sheetTag = strFromU8(workbook).match(new RegExp(`<${PREFIX}sheet\\b[^>]*>`))?.[0] ?? "";
  const relationshipId = sheetTag.match(/\s(?:[A-Za-z0-9_-]+:)?id="([^"]+)"/i)?.[1];
  if (!relationshipId) {
    return fallback;
  }
  for (const tag of strFromU8(relationships).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = tag[0].match(/\sId="([^"]+)"/)?.[1];
    const target = tag[0].match(/\sTarget="([^"]+)"/)?.[1];
    if (id === relationshipId && target) {
      return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    }
  }
  return fallback;
}

export function readFirstSheet(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (entry) => NEEDED_ENTRIES.test(entry.name) && entry.originalSize <= MAX_ENTRY_BYTES,
    });
  } catch {
    throw new WorkbookError("O arquivo não é uma planilha .xlsx válida.");
  }
  const sheet = files[firstSheetPath(files)];
  if (!sheet) {
    throw new WorkbookError("A planilha não tem nenhuma aba com dados.");
  }
  const shared = files["xl/sharedStrings.xml"];
  const sharedStrings = shared ? readSharedStrings(strFromU8(shared)) : [];
  return readRows(strFromU8(sheet), sharedStrings);
}
