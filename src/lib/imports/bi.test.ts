import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { biExport, biExportCsv } from "../../../tests/bi-export";
import { BiFormatError, parseBiExport, parseFilters, parseLives } from "./bi";
import { readImportSheet, validateImportFile } from "./file";
import { readFirstSheet, WorkbookError } from "./xlsx";

const CNPJ_A = "11222333000181";
const CNPJ_B = "00000000000191";
const OCTOBER = "2026-10-01";

function parse(bytes: Uint8Array, competency = OCTOBER) {
  return parseBiExport(readFirstSheet(bytes), competency);
}

const twoCompanies = [
  { group: "Grupo X", company: "Empresa A", cnpj: "11.222.333/0001-81", lives: 48 },
  { company: "Empresa B", cnpj: CNPJ_B, lives: 10 },
];

describe("parseBiExport", () => {
  it("reads the BI export: subtotals skipped, one row per CNPJ, month from the footer", () => {
    const result = parse(biExport(twoCompanies, "2026-10"));
    expect(result.rows).toEqual([
      {
        line_number: 4,
        cnpj: CNPJ_A,
        competency: OCTOBER,
        lives: 48,
        company_name: "Empresa A",
        group_name: "Grupo X",
      },
      {
        line_number: 7,
        cnpj: CNPJ_B,
        competency: OCTOBER,
        lives: 10,
        company_name: "Empresa B",
        group_name: "Empresa B",
      },
    ]);
    expect(result.rows_read).toBe(2);
    expect(result.issues).toEqual([]);
    expect(result.filter_competency).toBe(OCTOBER);
  });

  it("reads the same file re-saved by Excel (shared strings and cell references)", () => {
    const result = parse(biExport(twoCompanies, "2026-10", { excelStyle: true }));
    expect(result.rows.map((row) => [row.cnpj, row.lives, row.company_name])).toEqual([
      [CNPJ_A, 48, "Empresa A"],
      [CNPJ_B, 10, "Empresa B"],
    ]);
    expect(result.filter_competency).toBe(OCTOBER);
  });

  it("reports invalid CNPJ and lives, and counts a blank cash-in as zero", () => {
    const result = parse(
      biExport(
        [
          { company: "Inválida", cnpj: "11.111.111/1111-11", lives: 3 },
          { company: "Empresa B", cnpj: CNPJ_B, lives: "dez" },
          { company: "Empresa A", cnpj: CNPJ_A, lives: "" },
        ],
        "2026-10",
      ),
    );
    expect(result.rows_read).toBe(3);
    expect(result.rows).toEqual([
      expect.objectContaining({ cnpj: CNPJ_A, lives: 0, company_name: "Empresa A" }),
    ]);
    expect(result.issues.map((issue) => [issue.outcome, issue.reason])).toEqual([
      ["ignored", "CNPJ inválido."],
      ["ignored", "Vidas inválidas (C. Cash-in)."],
    ]);
  });

  it("counts an identical repeated row once and sums different lives for the same CNPJ", () => {
    const result = parse(
      biExport(
        [
          { company: "Empresa A", cnpj: CNPJ_A, lives: 10 },
          { company: "Empresa A", cnpj: CNPJ_A, lives: 10 },
          { company: "Empresa A", cnpj: CNPJ_A, lives: 5 },
        ],
        "2026-10",
      ),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.lives).toBe(15);
    expect(result.issues.map((issue) => issue.outcome)).toEqual(["merged", "merged"]);
    expect(result.issues[1]?.reason).toContain("10 + 5 = 15");
  });

  it("refuses an export that covers more than one month and accepts one without the footer", () => {
    expect(() => parse(biExport(twoCompanies, null, { months: ["2026-09", "2026-10"] }))).toThrow(
      /um mês por vez/,
    );
    expect(parse(biExport(twoCompanies, null)).filter_competency).toBeNull();
  });

  it("fails clearly when the cnpj or C. Cash-in column is missing", () => {
    const strange = biExport(twoCompanies, "2026-10", { header: ["coluna1", "coluna2"] });
    expect(() => parse(strange)).toThrow(BiFormatError);
    expect(() => parse(strange)).toThrow(/cnpj, C\. Cash-in/);
  });

  it("rejects a file that is not a workbook", () => {
    expect(() => readFirstSheet(new TextEncoder().encode("cnpj;vidas\n1;2"))).toThrow(
      WorkbookError,
    );
  });
});

describe("helpers", () => {
  it("reads the month from the applied filters footer", () => {
    expect(
      parseFilters(
        "Filtros aplicados:\r\nconvenio é Fortespay\r\nAno é 2026\r\nIncluídos (1) outubro (Mês)",
      ),
    ).toBe("2026-10-01");
    expect(parseFilters("Filtros aplicados:\nAno é 2026\nMês é março")).toBe("2026-03-01");
    expect(parseFilters("Filtros aplicados:\nconvenio é Fortespay")).toBeNull();
    expect(() => parseFilters("Ano é 2026\nIncluídos (2) setembro, outubro (Mês)")).toThrow(
      BiFormatError,
    );
  });

  it("parses lives as Excel writes integers", () => {
    expect(parseLives("48")).toBe(48);
    expect(parseLives("2728.0")).toBe(2728);
    expect(parseLives("")).toBe(0);
    expect(parseLives("-1")).toBeNull();
    expect(parseLives("4.8")).toBeNull();
    // CSV em português: ponto de milhar.
    expect(parseLives("2.657")).toBe(2657);
    expect(parseLives("1.234.567")).toBe(1234567);
    expect(parseLives("1.000")).toBe(1000);
    expect(parseLives("2.65")).toBeNull();
    expect(parseLives("dez")).toBeNull();
  });

  it("validates the uploaded file by name, type and size", () => {
    expect(() => validateImportFile("Detalhamento Empresas (77).xlsx", "", 100)).not.toThrow();
    expect(() =>
      validateImportFile("Planilha sem título - Export.csv", "text/csv", 100),
    ).not.toThrow();
    expect(() => validateImportFile("dados.pdf", "application/pdf", 100)).toThrow(
      /\.csv ou \.xlsx/,
    );
    expect(() => validateImportFile("dados.xlsx", "text/plain", 100)).toThrow(/não suportado/);
    expect(() => validateImportFile("dados.csv", "application/pdf", 100)).toThrow(/não suportado/);
    expect(() => validateImportFile("dados.csv", "text/x-csv", 100)).not.toThrow();
    expect(() => validateImportFile("dados.csv", "application/vnd.ms-excel", 100)).not.toThrow();
    expect(() => validateImportFile("dados.xlsx", "", 0)).toThrow(/vazio/);
    expect(() => validateImportFile("dados.xlsx", "", 6 * 1024 * 1024)).toThrow(/4 MB/);
  });
});

// The real export is not versioned (client data); this runs only where the file exists.
describe("real export", () => {
  const file = readdirSync(".").find((name) => /^Detalhamento Empresas.*\.xlsx$/i.test(name));

  it.skipIf(!file)("reads the real file: one row per CNPJ, october 2026 in the footer", () => {
    const result = parse(readFileSync(file as string), OCTOBER);
    const invalid = result.issues.filter((issue) => issue.outcome === "ignored");
    console.log(
      `arquivo real: ${result.rows_read} linhas de CNPJ, ${result.rows.length} CNPJs, ${invalid.length} inválidas, ${result.issues.length - invalid.length} mescladas, mês ${result.filter_competency}`,
    );
    for (const issue of result.issues.slice(0, 5)) {
      console.log(`  linha ${issue.line_number}: ${issue.reason}`);
    }
    expect(result.rows_read).toBeGreaterThan(1000);
    expect(result.filter_competency).toBe("2026-10-01");
    expect(invalid.length).toBeLessThan(result.rows_read * 0.05);
  });
});

describe("CSV export (Google Sheets / Excel)", () => {
  const rows = [
    { group: "Grupo X", company: "Empresa A", cnpj: CNPJ_A, lives: 2657 },
    { group: "Grupo X", company: "Empresa B", cnpj: CNPJ_B, lives: 10 },
    { group: "Grupo Y", company: "Produtor Rural", cnpj: "00003358246507", lives: 46 },
  ];

  it("reads names from the subtotal rows, numbers in Portuguese and the multi-line footer", () => {
    const result = parseBiExport(
      readImportSheet("Planilha sem título - Export.csv", biExportCsv(rows, "2026-11")),
      "2026-11-01",
    );
    expect(result.filter_competency).toBe("2026-11-01");
    expect(result.rows_read).toBe(3);
    expect(
      result.rows.map((row) => [row.cnpj, row.lives, row.company_name, row.group_name]),
    ).toEqual([
      [CNPJ_A, 2657, "Empresa A", "Grupo X"],
      [CNPJ_B, 10, "Empresa B", "Grupo X"],
    ]);
    // CPF com zeros à esquerda no lugar do CNPJ: ignorado, como no .xlsx.
    expect(result.issues.map((issue) => [issue.outcome, issue.reason])).toEqual([
      ["ignored", "CNPJ inválido."],
    ]);
  });

  it("reads the Excel-in-Portuguese variant: ';' separator and Windows-1252", () => {
    const accented = [
      { group: "Pães & Cia", company: "Padaria São João", cnpj: CNPJ_A, lives: 1500 },
    ];
    const result = parseBiExport(
      readImportSheet(
        "export.csv",
        biExportCsv(accented, "2026-10", { separator: ";", latin1: true }),
      ),
      OCTOBER,
    );
    expect(result.filter_competency).toBe(OCTOBER);
    expect(result.rows).toMatchObject([
      { cnpj: CNPJ_A, lives: 1500, company_name: "Padaria São João", group_name: "Pães & Cia" },
    ]);
  });

  it("a group with no name leaves the group blank", () => {
    const sheet = readImportSheet(
      "x.csv",
      new TextEncoder().encode(
        [
          "Grupo Empresarial,nome_empresa,cnpj,C. Cash-in",
          "Grupo Z,Total,,5",
          ",Empresa Z,Total,5",
          `,,${CNPJ_A},5`,
          ",Total,,3",
          ",Empresa Sem Grupo,Total,3",
          `,,${CNPJ_B},3`,
        ].join("\n"),
      ),
    );
    const result = parseBiExport(sheet, OCTOBER);
    expect(result.rows.map((row) => [row.company_name, row.group_name])).toEqual([
      ["Empresa Z", "Grupo Z"],
      ["Empresa Sem Grupo", null],
    ]);
  });

  it("refuses a CSV with an unfinished quoted cell", () => {
    expect(() => readImportSheet("x.csv", new TextEncoder().encode('cnpj,"C. Cash-in\n1'))).toThrow(
      BiFormatError,
    );
  });
});

// The real CSV is not versioned (client data); this runs only where the file exists.
describe("real CSV export", () => {
  const folder = ".local/exports-csv";
  let file: string | undefined;
  try {
    file = readdirSync(folder).find((name) => name.endsWith(".csv"));
  } catch {
    file = undefined;
  }

  it.skipIf(!file)(
    "reads the real CSV: names carried, only CPF rows ignored, month in the footer",
    () => {
      const grid = readImportSheet(file as string, readFileSync(`${folder}/${file}`));
      const result = parseBiExport(grid, "2026-11-01");
      expect(result.filter_competency).toMatch(/^\d{4}-\d{2}-01$/);
      expect(result.rows.length).toBeGreaterThan(1000);
      expect(
        result.rows.every((row) => !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(row.company_name)),
      ).toBe(true);
      for (const issue of result.issues) {
        expect(issue.reason).toBe("CNPJ inválido.");
        expect(issue.raw_line).toMatch(/;000\d{11};/);
      }
    },
  );
});
