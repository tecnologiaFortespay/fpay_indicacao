import { expect, test } from "@playwright/test";
import { fixtures, login } from "./helpers";

// Roteiro do Denis, Fatia 5 (docs/testes-denis.md). Depende do estado deixado pelos roteiros anteriores
// desta execução (Natal com vidas em setembro, junho acumulado e julho pago).
test("fatia 5: painel do parceiro com vidas, prévia, saldo pendente, confirmação e carimbo", async ({
  page,
  browser,
}) => {
  const run = fixtures();
  await login(page, run.partners.natal.email, run.password);
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole("heading", { level: 1, name: "Meu painel" })).toBeVisible();
  await expect(page.getByText(/Dados atualizados em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

  // Setembro: 50 vidas × R$ 1,50 = R$ 75,00 (prévia).
  await page.goto("/inicio?competency=2026-09");
  const livesCard = page.getByRole("heading", { name: "Vidas pagas" }).locator("..").locator("..");
  await expect(livesCard).toContainText("50");
  const previewCard = page
    .getByRole("heading", { name: "Valor a receber (prévia)" })
    .locator("..")
    .locator("..");
  await expect(previewCard).toContainText("75,00");
  // O último mês importado (outubro, pelo roteiro da Fatia 1) veio sem o CNPJ X: inadimplente, mas setembro teve 50 vidas.
  await expect(page.getByRole("row", { name: /Empresa X Ltda/ })).toContainText("Inadimplente");
  await expect(page.getByRole("row", { name: /Empresa X Ltda/ })).toContainText("50");
  await expect(page.getByText(/\d+ cliente\(s\) inadimplente\(s\)/)).toBeVisible();

  // Saldo pendente zerado (julho foi pago) e último fechamento = julho, R$ 122,00, aguardando confirmação.
  const pendingCard = page
    .getByRole("heading", { name: "Saldo pendente" })
    .locator("..")
    .locator("..");
  await expect(pendingCard).toContainText("0,00");
  const lastCard = page
    .getByRole("heading", { name: "Último fechamento" })
    .locator("..")
    .locator("..");
  await expect(lastCard).toContainText("122,00");
  await expect(lastCard).toContainText("aguardando sua confirmação");

  // Meus fechamentos: julho (pago) e junho (acumulado); confirma julho.
  await page.goto("/fechamentos");
  const july = page.locator("section", {
    has: page.getByRole("heading", { name: "julho de 2026" }),
  });
  await expect(july).toContainText("Pagar");
  await expect(july).toContainText("122,00");
  const june = page.locator("section", {
    has: page.getByRole("heading", { name: "junho de 2026" }),
  });
  await expect(june).toContainText("Acumular");
  await expect(june).toContainText("Cortesia combinada por telefone.");
  await july.getByRole("button", { name: "Confirmar valor" }).click();
  await expect(july.getByText(/Confirmado em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await june.getByLabel(/^O que não confere/).fill("Faltou um cliente que pagou em junho.");
  await june.getByRole("button", { name: "Contestar" }).click();
  await expect(june.getByText(/Contestado em/)).toBeVisible();

  // Isolamento: nada de outros parceiros e nada da área interna.
  await page.goto("/parceiros");
  await expect(page).toHaveURL(/\/inicio$/);
  await page.goto("/fechamento?competency=2026-07");
  await expect(page).toHaveURL(/\/inicio$/);
  await page.goto("/importacoes");
  await expect(page).toHaveURL(/\/inicio$/);

  // O diretor vê as respostas no fechamento.
  const context = await browser.newContext();
  const director = await context.newPage();
  await login(director, run.director.email, run.password);
  await director.goto("/fechamento?competency=2026-07");
  await expect(director.getByRole("row", { name: /Unidade Natal/ })).toContainText("Confirmado");
  await director.goto("/fechamento?competency=2026-06");
  await expect(director.getByRole("row", { name: /Unidade Natal/ })).toContainText(
    "Contestado · Faltou um cliente que pagou em junho.",
  );
  await context.close();
});
