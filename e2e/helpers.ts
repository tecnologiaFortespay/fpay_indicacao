import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { biExport, type ExportRow } from "../tests/bi-export";
import { FIXTURES_PATH, type Fixtures } from "./global-setup";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function fixtures(): Fixtures {
  return JSON.parse(readFileSync(FIXTURES_PATH, "utf8")) as Fixtures;
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

// Envia o export do BI (gerado no formato real, docs/arquivo-bi.md) para o mês informado
// ("YYYY-MM") e espera cair no detalhe do lote.
export async function importExport(page: Page, name: string, month: string, rows: ExportRow[]) {
  await page.goto("/importacoes");
  await page.getByLabel("Mês de referência").fill(month);
  await page.getByLabel("Planilha do BI").setInputFiles({
    name,
    mimeType: XLSX_TYPE,
    buffer: Buffer.from(biExport(rows, month)),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
}
