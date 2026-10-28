import { expect, test, type Page } from "@playwright/test";
import { biCsv, fixtures, login } from "./helpers";

const CNPJ_A = "11.444.777/0001-61";

async function importCsv(page: Page, name: string, content: string) {
  await page.goto("/importacoes");
  await page
    .getByLabel("Arquivo CSV")
    .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content, "utf8") });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
}

// Roteiro do Denis, Fatia 4 (docs/testes-denis.md). Usa junho e julho de 2026 para não colidir com os meses dos outros roteiros.
test("fatia 4: conferir, ajustar, marcar quem paga, fechar lote e carregar o saldo pendente", async ({
  page,
}) => {
  const run = fixtures();
  await login(page, run.director.email, run.password);

  // Base: Natal com regra R$ 1,50 desde julho e a indicação do CNPJ A; vidas de junho (40) e julho (48).
  await page.goto(`/parceiros/${run.partners.natal.id}`);
  await page.getByLabel("Valor por vida (R$)").fill("1,50");
  await page.getByLabel("Vigência a partir de").fill("2026-05");
  await page.getByRole("button", { name: "Salvar regra" }).click();
  await expect(page.getByRole("cell", { name: "maio de 2026" })).toBeVisible();
  await page.getByLabel("CNPJ do cliente").fill(CNPJ_A);
  await page.getByLabel("Empresa", { exact: true }).fill("Empresa A");
  await page.getByRole("button", { name: "Registrar indicação" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Indicação registrada." })).toBeVisible();
  await importCsv(
    page,
    "ago-set.csv",
    biCsv([
      { cnpj: CNPJ_A, company: "Empresa A", lives: 40, month: "2026-06" },
      { cnpj: CNPJ_A, company: "Empresa A", lives: 48, month: "2026-07" },
    ]),
  );

  // Outubro (mês corrente) não fecha.
  await page.goto("/fechamento?competency=2026-10");
  await page.getByRole("button", { name: "Preparar cálculo" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Só é possível fechar um mês já encerrado." }),
  ).toBeVisible();

  // 1–3. Agosto: preparar, ajustar Natal em −R$ 10,00, fechar sem marcar Natal (acumula).
  await page.goto("/fechamento?competency=2026-06");
  await expect(page.getByText(/Há importação de junho de 2026/)).toBeVisible();
  await page.getByRole("button", { name: "Preparar cálculo" }).click();
  await expect(page.getByRole("heading", { name: /junho de 2026 · Em preparação/ })).toBeVisible();
  const natalRow = page.getByRole("row", { name: /Unidade Natal/ });
  await expect(natalRow).toContainText("60,00");
  await natalRow.getByLabel("Ajuste de Unidade Natal (R$)").fill("-10,00");
  await natalRow
    .getByLabel("Motivo do ajuste de Unidade Natal")
    .fill("Cortesia combinada por telefone.");
  await natalRow.getByRole("button", { name: "Salvar ajuste" }).click();
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("50,00");
  await page.getByRole("button", { name: "Fechar lote" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Confirme que conferiu" })).toBeVisible();
  await page.getByLabel(/^Conferi a base/).check();
  await page.getByRole("button", { name: "Fechar lote" }).click();
  await expect(page.getByRole("heading", { name: /junho de 2026 · Fechado/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("Acumular");
  await expect(page.getByRole("row", { name: /Unidade Manaus/ })).toContainText("—");

  // Saldo pendente aparece na Visão geral.
  await page.goto("/inicio");
  await expect(
    page.getByRole("heading", { name: "Saldo pendente" }).locator("..").locator(".."),
  ).toContainText("50,00");

  // 5. CSV de agosto depois do fechamento é ignorado com motivo; setembro continua entrando.
  await importCsv(
    page,
    "ago-set-v2.csv",
    biCsv([
      { cnpj: CNPJ_A, company: "Empresa A", lives: 99, month: "2026-06" },
      { cnpj: CNPJ_A, company: "Empresa A", lives: 48, month: "2026-07" },
    ]),
  );
  await expect(page.getByRole("cell", { name: /Mês já fechado \(06\/2026\)/ })).toBeVisible();

  // 6–7. Setembro: saldo anterior de Natal R$ 50,00 + R$ 72,00 = R$ 122,00; marcar Natal e fechar.
  await page.goto("/fechamento?competency=2026-07");
  await page.getByRole("button", { name: "Preparar cálculo" }).click();
  const septemberRow = page.getByRole("row", { name: /Unidade Natal/ });
  await expect(septemberRow).toContainText("72,00");
  await expect(septemberRow).toContainText("122,00");
  await page.getByRole("checkbox", { name: /Unidade Natal · R\$ 122,00/ }).check();
  await page.getByLabel(/^Conferi a base/).check();
  await page.getByRole("button", { name: "Fechar lote" }).click();
  await expect(page.getByRole("heading", { name: /julho de 2026 · Fechado/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("Pagar");
  await expect(
    page
      .getByText("Total a pagar: R$ 122,00".replace(" ", " "))
      .or(page.getByText(/Total a pagar: R\$.122,00/)),
  ).toBeVisible();

  // 8. Histórico com os dois meses fechados; saldo pendente zerado.
  await expect(page.getByRole("link", { name: "junho de 2026" })).toBeVisible();
  await page.goto("/inicio");
  await expect(
    page.getByRole("heading", { name: "Saldo pendente" }).locator("..").locator(".."),
  ).toContainText("0,00");
});
