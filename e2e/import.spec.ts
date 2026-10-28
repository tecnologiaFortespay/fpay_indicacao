import { expect, test } from "@playwright/test";
import { biExport } from "../tests/bi-export";
import { fixtures, importExport, login, XLSX_TYPE } from "./helpers";

const CNPJ_X = "11.222.333/0001-81";

// Roteiro do Denis, Fatia 1 (docs/testes-denis.md).
test("fatia 1: cadastrar parceiro, regra e indicação, importar o export do BI e ver vidas × valor", async ({
  page,
}) => {
  const run = fixtures();
  await login(page, run.director.email, run.password);

  // 2. Parceiro "Unidade Natal" já aprovado (cadastro por convite é o roteiro da Fatia 2).
  await page.goto("/parceiros");
  await expect(page.getByText("Novo parceiro")).toHaveCount(0);
  await page.getByRole("link", { name: /Unidade Natal/ }).click();
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

  // 4. Export de setembro com 48 em C. Cash-in para X e um cliente que não foi indicado.
  const september48 = [
    { cnpj: CNPJ_X, company: "Empresa X Ltda", lives: 48, group: "Grupo X" },
    { cnpj: "00.000.000/0001-91", company: "Outra Empresa", lives: 10 },
  ];
  await importExport(page, "setembro.xlsx", "2026-09", september48);
  await expect(page.getByText("Nenhuma linha ignorada ou mesclada.")).toBeVisible();
  await expect(page.getByText("Fora da plataforma").locator("..")).toContainText("1");

  // 5. Visão geral de setembro: Natal · 48 · R$ 1,50 · R$ 72,00.
  await page.goto("/inicio?competency=2026-09");
  const natalRow = page.getByRole("row", { name: /Unidade Natal/ });
  await expect(natalRow).toContainText("48");
  await expect(natalRow).toContainText("1,50");
  await expect(natalRow).toContainText("72,00");
  await expect(page.getByText(/Dados atualizados em .* por Diretor E2E/)).toBeVisible();

  // 6. O mesmo arquivo de novo: lote novo, vidas continuam 48 (não 96).
  await importExport(page, "setembro.xlsx", "2026-09", september48);
  await page.goto("/inicio?competency=2026-09");
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("48");
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).not.toContainText("96");

  // 7. Arquivo com 50: substitui o mês.
  await importExport(page, "setembro-v2.xlsx", "2026-09", [
    { cnpj: CNPJ_X, company: "Empresa X Ltda", lives: 50 },
  ]);
  await page.goto("/inicio?competency=2026-09");
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("50");
  await expect(page.getByRole("row", { name: /Unidade Natal/ })).toContainText("75,00");

  // A indicação virou Ativa automaticamente.
  await page.goto("/parceiros");
  await page.getByRole("link", { name: /Unidade Natal/ }).click();
  await expect(page.getByRole("cell", { name: "Ativa" })).toBeVisible();
  await expect(page.getByRole("row", { name: /setembro de 2026/ }).last()).toContainText("75,00");

  // Importações: três lotes, com autor, mês e empresas fora da plataforma.
  await page.goto("/importacoes");
  await expect(page.getByRole("link", { name: /setembro-v2\.xlsx/ })).toContainText("Diretor E2E");
  await expect(page.getByRole("link", { name: /setembro\.xlsx/ })).toHaveCount(2);
  await expect(page.getByRole("link", { name: /setembro\.xlsx/ }).first()).toContainText(
    "1 fora da plataforma",
  );
  await expect(page.getByRole("link", { name: /setembro-v2\.xlsx/ })).toHaveCount(1);
});

test("mês escolhido diferente do filtro do arquivo é recusado com explicação", async ({ page }) => {
  const run = fixtures();
  await login(page, run.analyst.email, run.password);
  await page.goto("/importacoes");
  await page.getByLabel("Mês de referência").fill("2026-09");
  await page.getByLabel("Planilha do BI").setInputFiles({
    name: "outubro.xlsx",
    mimeType: XLSX_TYPE,
    buffer: Buffer.from(biExport([{ cnpj: CNPJ_X, company: "Empresa X", lives: 1 }], "2026-10")),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({
        hasText: "O arquivo é de outubro de 2026, mas o mês escolhido foi setembro de 2026.",
      }),
  ).toBeVisible();
});

test("planilha sem as colunas do BI é recusada com explicação", async ({ page }) => {
  const run = fixtures();
  await login(page, run.analyst.email, run.password);
  await page.goto("/importacoes");
  await page.getByLabel("Mês de referência").fill("2026-10");
  await page.getByLabel("Planilha do BI").setInputFiles({
    name: "estranha.xlsx",
    mimeType: XLSX_TYPE,
    buffer: Buffer.from(biExport([], "2026-10", { header: ["coluna1", "coluna2"] })),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Não encontrei a(s) coluna(s) cnpj, C. Cash-in" }),
  ).toBeVisible();
});

test("analista importa e vê o log; linhas inválidas aparecem com motivo", async ({ page }) => {
  const run = fixtures();
  await login(page, run.analyst.email, run.password);
  await importExport(page, "outubro.xlsx", "2026-10", [
    { cnpj: "00.000.000/0001-91", company: "Outra Empresa", lives: 12 },
    { cnpj: "11.111.111/1111-11", company: "CNPJ inválido", lives: 3 },
  ]);
  await expect(page.getByText("1 linha(s)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "CNPJ inválido." })).toBeVisible();
  await expect(page.getByText("outubro de 2026")).toBeVisible();
});
