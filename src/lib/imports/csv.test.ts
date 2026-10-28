import { describe, expect, it } from "vitest";
import { decodeCsv } from "./file";
import {
  CsvFormatError,
  detectDelimiter,
  parseBiCsv,
  parseLives,
  parseMonth,
  splitCsvLine,
} from "./csv";

const CNPJ_A = "11222333000181";
const CNPJ_B = "00000000000191";

describe("parseBiCsv", () => {
  it("reads the hypothesized BI layout with semicolons", () => {
    const csv = [
      "Grupo;Empresa;CNPJ;Vidas;Mês",
      "Grupo X;Empresa A;11.222.333/0001-81;48;2026-09",
    ].join("\n");
    const result = parseBiCsv(csv);
    expect(result.rows).toEqual([
      {
        line_number: 2,
        cnpj: CNPJ_A,
        competency: "2026-09-01",
        lives: 48,
        company_name: "Empresa A",
        group_name: "Grupo X",
      },
    ]);
    expect(result.rows_read).toBe(1);
    expect(result.issues).toEqual([]);
    expect(result.competencies).toEqual(["2026-09-01"]);
  });

  it("accepts commas, quotes, a BOM and columns in any order", () => {
    const csv = `﻿Vidas,CNPJ,Empresa,Competência\n"1.234","${CNPJ_B}","Empresa, Ltda","09/2026"\n`;
    const result = parseBiCsv(csv);
    expect(result.rows).toEqual([
      {
        line_number: 2,
        cnpj: CNPJ_B,
        competency: "2026-09-01",
        lives: 1234,
        company_name: "Empresa, Ltda",
        group_name: null,
      },
    ]);
  });

  it("ignores rows with invalid CNPJ, month or lives and reports why", () => {
    const csv = [
      "cnpj;vidas;mes",
      "11222333000180;10;2026-09",
      `${CNPJ_A};10;setembro`,
      `${CNPJ_A};dez;2026-09`,
      `${CNPJ_A};10;2026-09`,
    ].join("\n");
    const result = parseBiCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows_read).toBe(4);
    expect(result.issues.map((issue) => [issue.line_number, issue.reason])).toEqual([
      [2, "CNPJ inválido."],
      [3, "Mês não reconhecido."],
      [4, "Vidas inválidas."],
    ]);
  });

  it("counts identical repeated lines once and sums different lives for the same CNPJ and month", () => {
    const csv = [
      "cnpj;vidas;mes",
      `${CNPJ_A};10;2026-09`,
      `${CNPJ_A};10;2026-09`,
      `${CNPJ_A};5;2026-09`,
    ].join("\n");
    const result = parseBiCsv(csv);
    expect(result.rows[0].lives).toBe(15);
    expect(result.issues.map((issue) => issue.outcome)).toEqual(["merged", "merged"]);
    expect(result.issues[1].reason).toContain("10 + 5 = 15");
  });

  it("keeps several months in one file", () => {
    const csv = ["cnpj;vidas;mes", `${CNPJ_A};10;2026-08`, `${CNPJ_A};12;2026-09`].join("\n");
    const result = parseBiCsv(csv);
    expect(result.competencies).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("fails clearly when a required column is missing", () => {
    expect(() => parseBiCsv("empresa;cnpj;vidas\nA;1;2")).toThrow(CsvFormatError);
    expect(() => parseBiCsv("empresa;cnpj;vidas\nA;1;2")).toThrow(/mês/);
  });
});

describe("helpers", () => {
  it("detects the delimiter from the header", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
  });

  it("splits quoted cells", () => {
    expect(splitCsvLine('"a;b";c;"d ""e"""', ";")).toEqual(["a;b", "c", 'd "e"']);
  });

  it("parses the month formats we expect from the BI", () => {
    expect(parseMonth("2026-09")).toBe("2026-09-01");
    expect(parseMonth("2026-09-15")).toBe("2026-09-01");
    expect(parseMonth("2026-09-01 00:00:00")).toBe("2026-09-01");
    expect(parseMonth("09/2026")).toBe("2026-09-01");
    expect(parseMonth("15/09/2026")).toBe("2026-09-01");
    expect(parseMonth("2026/09")).toBe("2026-09-01");
    expect(parseMonth("13/2026")).toBeNull();
    expect(parseMonth("setembro")).toBeNull();
  });

  it("parses lives with thousands separators", () => {
    expect(parseLives("48")).toBe(48);
    expect(parseLives("1.234")).toBe(1234);
    expect(parseLives("48,0")).toBe(48);
    expect(parseLives("-1")).toBeNull();
    expect(parseLives("4.8")).toBeNull();
  });

  it("decodes UTF-8 with BOM and falls back to Windows-1252", () => {
    const utf8 = new TextEncoder().encode("﻿cnpj;empresa\n1;São Paulo");
    expect(decodeCsv(utf8)).toBe("cnpj;empresa\n1;São Paulo");
    const latin1 = Uint8Array.from([0x53, 0xe3, 0x6f]);
    expect(decodeCsv(latin1)).toBe("São");
  });
});
