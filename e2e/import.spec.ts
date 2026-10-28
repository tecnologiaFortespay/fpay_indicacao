import { expect, test, type Page } from "@playwright/test";
import { biCsv, fixtures, login } from "./helpers";

const CNPJ_X = "11.222.333/0001-81";

async function uploadCsv(page: Page, name: string, content: string) {
  await page.goto("/importacoes");
  await page
    .getByLabel("Arquivo CSV")
    .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content, "utf8") });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
}

// Roteiro do Denis, Fatia 1 (docs/testes-denis.md).
test("fatia 1: cadastrar parceiro, regra e indicação, importar o CSV e ver vidas × valor", async ({
  page,
}) => {
  const run = fixtures();
  await login(page, run.director.email, run.password);

  // 2. Parceiro "Unidade Natal" com PIX.
  await page.goto("/parceiros");
  // O formulário já vem aberto quando não há parceiros; abre só se estiver fechado.
  const disclosure = page.locator("details.fp-disclosure");
  const alreadyOpen = await disclosure.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!alreadyOpen) {
    await disclosure.locator("summary").click();
  }
  await page.getByLabel("Nome do parceiro (unidade ou pessoa)").fill("Unidade Natal");
  await page.getByLabel("Cidade").fill("Natal");
  await page.getByLabel("UF").fill("RN");
  await page.getByLabel(/^Meio de pagamento/).selectOption("pix");
  await page.getByLabel("Chave PIX").fill("natal@fortespay.local");
  await page.getByRole("button", { name: "Cadastrar parceiro" }).click();
  await expect(page).toHaveURL(/\/parceiros\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Unidade Natal" })).toBeVisible();

  // Regra: R$ 1,50 por vida desde agosto de 2026.
  await page.getByLabel("Valor por vida (R$)").fill("1,50");
  await page.getByLabel("Vigência a partir de").fill("2026-08");
  await page.getByRole("button", { name: "Salvar regra" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Regra salva." })).toBeVisible();
  await expect(page.getByRole("cell", { name: "agosto de 2026" })).toBeVisible();

  // 3. Indicação do CNPJ X.
  await page.getByLabel("CNPJ do cliente").fill(CNPJ_X);
  await page.getByLabel("Empresa", { exact: true }).fill("Empresa X Ltda");
  await page.getByRole("button", { name: "Registrar indicação" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Indicação registrada." })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Indicada" })).toBeVisible();

  // 4. CSV de setembro com 48 vidas para X (e um cliente não indicado).
  const september48 = biCsv([
    { cnpj: CNPJ_X, company: "Empresa X Ltda", lives: 48, month: "2026-09", group: "Grupo X" },
    { cnpj: "00.000.000/0001-91", company: "Outra Empresa", lives: 10, month: "2026-09" },
  ]);
  await uploadCsv(page, "setembro.csv", september48);
  await expect(page.getByText("Todas as linhas entraram como estavam no arquivo.")).toBeVisible();

  // 5. Visão geral de setembro: Natal · 48 · R$ 1,50 · R$ 72,00.
  await page.goto("/inicio?competency=2026-09");
  const natalRow = page.getByRole("row", { name: /Unidade Natal/ });
  await expect(natalRow).toContainText("48");
  await expect(natalRow).toContainText("1,50");
  await expect(natalRow).toContainText("72,00");
  await expect(page.getByText(/Dados atualizados em .* por Diretor E2E/)).toBeVisible();

  // 6. O mesmo arquivo de novo: lote novo, vidas continuam 48 (não 96).
  await uploadCsv(page, "setembro.csv", september48);
  await page.goto("/inicio?competency=2026-09");
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("48");
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).not.toContainText("96");

  // 7. Arquivo com 50 vidas: substitui o mês.
  const september50 = biCsv([
    { cnpj: CNPJ_X, company: "Empresa X Ltda", lives: 50, month: "2026-09" },
  ]);
  await uploadCsv(page, "setembro-v2.csv", september50);
  await page.goto("/inicio?competency=2026-09");
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("50");
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("75,00");

  // A indicação virou Ativa automaticamente.
  await page.goto("/parceiros");
  await page.getByRole("link", { name: /Unidade Natal/ }).click();
  await expect(page.getByRole("cell", { name: "Ativa" })).toBeVisible();
  await expect(page.getByRole("row", { name: /setembro de 2026/ }).last()).toContainText("75,00");

  // Importações: três lotes, com autor e mês.
  await page.goto("/importacoes");
  await expect(page.getByRole("link", { name: /setembro-v2\.csv/ })).toContainText("Diretor E2E");
  await expect(page.getByText("3 lote(s)")).toBeVisible();
});

test("arquivo sem as colunas esperadas é recusado com explicação", async ({ page }) => {
  const run = fixtures();
  await login(page, run.analyst.email, run.password);
  await page.goto("/importacoes");
  await page.getByLabel("Arquivo CSV").setInputFiles({
    name: "estranho.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("coluna1;coluna2\n1;2\n", "utf8"),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Não encontrei a(s) coluna(s) CNPJ, vidas, mês" }),
  ).toBeVisible();
});

test("analista importa e vê o log; linhas inválidas aparecem com motivo", async ({ page }) => {
  const run = fixtures();
  await login(page, run.analyst.email, run.password);
  const csv = biCsv([
    { cnpj: "00.000.000/0001-91", company: "Outra Empresa", lives: 12, month: "10/2026" },
    { cnpj: "11.111.111/1111-11", company: "CNPJ inválido", lives: 3, month: "10/2026" },
  ]);
  await uploadCsv(page, "outubro.csv", csv);
  await expect(page.getByText("1 linha(s)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "CNPJ inválido." })).toBeVisible();
  await expect(page.getByText("outubro de 2026")).toBeVisible();
});
