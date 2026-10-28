import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { FIXTURES_PATH, type Fixtures } from "./global-setup";

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

// Monta um CSV no formato hipotético do BI (docs/csv-bi.md).
export function biCsv(
  rows: { cnpj: string; company: string; lives: number; month: string; group?: string }[],
) {
  const header = "Grupo;Empresa;CNPJ;Vidas;Mês";
  const lines = rows.map((row) =>
    [row.group ?? "", row.company, row.cnpj, row.lives, row.month].join(";"),
  );
  return [header, ...lines].join("\n");
}
