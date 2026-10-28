import { expect, test, type Page } from "@playwright/test";
import { biCsv, fixtures, login } from "./helpers";

const CNPJ_Y = "12.ABC.345/01DE-35";

async function importCsv(page: Page, name: string, content: string) {
  await page.goto("/importacoes");
  await page
    .getByLabel("Arquivo CSV")
    .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content, "utf8") });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
}

// Depois de "Alterar" a linha é re-renderizada com a nova situação (e o formulário some quando não há mais transição).
async function changeStatus(page: Page, company: string, status: string, label: string) {
  const row = page.getByRole("row", { name: new RegExp(company) });
  await row.getByLabel(`Nova situação de ${company}`).selectOption(status);
  await row.getByRole("button", { name: "Alterar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(company) })).toContainText(label);
}

// Roteiro do Denis, Fatia 3 (docs/testes-denis.md).
test("fatia 3: indicações com as 7 situações e bloqueio de CNPJ duplicado", async ({
  browser,
  page,
}) => {
  const run = fixtures();

  // 1. Natal registra o CNPJ Y.
  const natalContext = await browser.newContext();
  const natal = await natalContext.newPage();
  await login(natal, run.partners.natal.email, run.password);
  await natal.goto("/indicacoes");
  await natal.getByLabel("CNPJ do cliente").fill(CNPJ_Y);
  await natal.getByLabel("Empresa", { exact: true }).fill("Empresa Y");
  await natal.getByLabel("Vidas estimadas").fill("30");
  await natal.getByRole("button", { name: "Registrar indicação" }).click();
  await expect(
    natal.getByRole("status").filter({ hasText: "Indicação registrada." }),
  ).toBeVisible();
  const natalRow = natal.getByRole("row", { name: /Empresa Y/ });
  await expect(natalRow).toContainText("Indicada");
  await expect(natalRow).toContainText("12.ABC.345/01DE-35");

  // 2. Manaus tenta o mesmo CNPJ: só a data, sem o nome de quem indicou.
  const manausContext = await browser.newContext();
  const manaus = await manausContext.newPage();
  await login(manaus, run.partners.manaus.email, run.password);
  await manaus.goto("/indicacoes");
  await manaus.getByLabel("CNPJ do cliente").fill(CNPJ_Y);
  await manaus.getByLabel("Empresa", { exact: true }).fill("Tentativa");
  await manaus.getByRole("button", { name: "Registrar indicação" }).click();
  const duplicateAlert = manaus.getByRole("alert").filter({ hasText: "CNPJ já indicado em" });
  await expect(duplicateAlert).toBeVisible();
  await expect(duplicateAlert).toHaveText(/^CNPJ já indicado em \d{2}\/\d{2}\/\d{4}\.$/);
  await expect(manaus.getByRole("row", { name: /Empresa Y/ })).toHaveCount(0);

  // 3. Diretor vê que foi Natal (inclusive ao tentar registrar o mesmo CNPJ).
  await login(page, run.director.email, run.password);
  await page.goto("/indicacoes");
  const directorRow = page.getByRole("row", { name: /Empresa Y/ });
  await expect(directorRow).toContainText("Unidade Natal");
  await page
    .getByRole("combobox", { name: "Parceiro", exact: true })
    .last()
    .selectOption(run.partners.manaus.id);
  await page.getByLabel("CNPJ do cliente").fill(CNPJ_Y);
  await page.getByLabel("Empresa", { exact: true }).fill("Tentativa do diretor");
  await page.getByRole("button", { name: "Registrar indicação" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "por Unidade Natal." })).toBeVisible();

  // 4. Em negociação, depois Fechada.
  await changeStatus(page, "Empresa Y", "negotiating", "Em negociação");
  await changeStatus(page, "Empresa Y", "signed", "Fechada");

  // 5. O CSV de outubro traz Y: Ativa.
  await importCsv(
    page,
    "outubro.csv",
    biCsv([{ cnpj: CNPJ_Y, company: "Empresa Y", lives: 20, month: "2026-10" }]),
  );
  await page.goto("/indicacoes");
  await expect(page.getByRole("row", { name: /Empresa Y/ })).toContainText("Ativa");
  await expect(page.getByRole("row", { name: /Empresa Y/ })).toContainText("20");
  await natal.reload();
  await expect(natal.getByRole("row", { name: /Empresa Y/ })).toContainText("Ativa");

  // 6. O CSV seguinte de outubro vem sem Y: Inadimplente.
  await importCsv(
    page,
    "outubro-v2.csv",
    biCsv([{ cnpj: "00.000.000/0001-91", company: "Outra", lives: 3, month: "2026-10" }]),
  );
  await page.goto("/indicacoes");
  await expect(page.getByRole("row", { name: /Empresa Y/ })).toContainText("Inadimplente");

  // 7. Cancelada: encerra a recorrência.
  await changeStatus(page, "Empresa Y", "cancelled", "Cancelada");
  await page.goto("/inicio");
  await expect(page.getByRole("link", { name: /Cancelada/ }).first()).toContainText("1");

  // 8. Natal não enxerga indicações de Manaus, e vice-versa.
  await manaus.goto("/indicacoes");
  await expect(manaus.getByText("Nenhuma indicação encontrada.")).toBeVisible();
  await natalContext.close();
  await manausContext.close();
});
