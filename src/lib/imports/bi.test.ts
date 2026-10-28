import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { biExport } from "../../../tests/bi-export";
import { BiFormatError, parseBiExport, parseFilters, parseLives } from "./bi";
import { validateImportFile } from "./file";
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
    expect(parseLives("dez")).toBeNull();
  });

  it("validates the uploaded file by name, type and size", () => {
    expect(() => validateImportFile("Detalhamento Empresas (77).xlsx", "", 100)).not.toThrow();
    expect(() => validateImportFile("dados.csv", "text/csv", 100)).toThrow(/\.xlsx/);
    expect(() => validateImportFile("dados.xlsx", "text/plain", 100)).toThrow(/não suportado/);
    expect(() => validateImportFile("dados.xlsx", "", 0)).toThrow(/vazio/);
    expect(() => validateImportFile("dados.xlsx", "", 6 * 1024 * 1024)).toThrow(/5 MB/);
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
