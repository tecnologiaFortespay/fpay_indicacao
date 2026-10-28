import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient } from "../scripts/bootstrap.mjs";
import { fixtures, login } from "./helpers";

// Roteiro do Denis, Fatia 2 (docs/testes-denis.md).
test("fatia 2: convite, cadastro pelo link e aprovação com regra e pagamento obrigatórios", async ({
  page,
  browser,
}) => {
  const run = fixtures();
  await login(page, run.director.email, run.password);

  // 1. Diretor gera o convite e copia o link.
  await page.goto("/parceiros");
  await expect(page.getByText("Novo parceiro")).toHaveCount(0);
  await page.getByLabel("Nome da unidade ou do indicador").fill("Unidade Teresina");
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const link = await page.getByLabel("Link do convite").inputValue();
  expect(link).toMatch(/\/convite\/[A-Za-z0-9_-]{40,}$/);
  await expect(page.getByRole("cell", { name: "Aguardando cadastro" })).toBeVisible();

  // 2. A unidade abre o link em outro navegador, preenche e cria a senha.
  const context = await browser.newContext();
  const partner = await context.newPage();
  await partner.goto(link);
  await expect(
    partner.getByRole("heading", { level: 1, name: "Cadastro · Unidade Teresina" }),
  ).toBeVisible();
  await partner.getByLabel("Cidade").fill("Teresina");
  await partner.getByLabel("UF").fill("PI");
  await partner.getByLabel("Nome do responsável").fill("Maria Silva");
  await partner.getByLabel("Telefone").fill("(86) 99999-0000");
  await partner.getByLabel("E-mail de acesso").fill("teresina.e2e@fortespay.local");
  await partner.getByLabel("Senha (mínimo de 8 caracteres)").fill(run.password);
  await partner.getByLabel(/^Meio de pagamento/).selectOption("pix");
  await partner.getByLabel("Chave PIX").fill("teresina@pix");
  await partner.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(partner).toHaveURL(/\/cadastro-em-analise$/);
  await expect(
    partner.getByRole("heading", { level: 1, name: "Cadastro em análise" }),
  ).toBeVisible();
  await expect(partner.getByText("Unidade Teresina")).toBeVisible();

  // Sem aprovação, o parceiro não entra no painel.
  await partner.goto("/inicio");
  await expect(partner).toHaveURL(/\/cadastro-em-analise$/);

  // 6. O mesmo link, de novo: já utilizado.
  await partner.goto(link);
  await expect(
    partner.getByRole("heading", { level: 1, name: "Convite já utilizado" }),
  ).toBeVisible();

  // 3. Diretor vê o cadastro aguardando e tenta aprovar sem regra.
  await page.goto("/parceiros");
  await expect(page.getByRole("cell", { name: "Cadastro feito" })).toBeVisible();
  await page.getByRole("link", { name: /Unidade Teresina/ }).click();
  await expect(page).toHaveURL(/\/parceiros\/[0-9a-f-]{36}$/);
  await expect(page.locator(".fp-detail-total").getByText("Aguardando aprovação")).toBeVisible();
  await expect(page.getByLabel("Chave PIX")).toHaveValue("teresina@pix");
  await page.getByRole("button", { name: "Aprovar cadastro" }).click();
  // Sem valor por vida o próprio navegador bloqueia o envio (campo obrigatório).
  await expect(page.getByLabel("Valor por vida (R$)")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );
  await expect(page.locator(".fp-detail-total").getByText("Aguardando aprovação")).toBeVisible();

  // Sem dados do PIX também não aprova.
  await page.getByLabel("Valor por vida (R$)").fill("2,00");
  await page.getByLabel("Vigência a partir de").fill("2026-10");
  await page.getByLabel("Chave PIX").fill("");
  await page.getByRole("button", { name: "Aprovar cadastro" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Informe a chave PIX." })).toBeVisible();

  // 4. Aprova com R$ 2,00 desde outubro, sem prazo, PIX.
  await page.getByLabel("Chave PIX").fill("teresina@pix");
  await page.getByRole("button", { name: "Aprovar cadastro" }).click();
  // A página passa a mostrar o parceiro ativo (a ficha muda de estado; a mensagem do formulário some com ele).
  await expect(page.getByText("Ativo", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "outubro de 2026" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2,00" })).toBeVisible();

  // 5. O parceiro recarrega e entra no painel.
  await partner.goto("/cadastro-em-analise");
  await expect(partner).toHaveURL(/\/inicio$/);
  await expect(partner.getByRole("heading", { level: 1, name: "Meu painel" })).toBeVisible();
  await expect(partner.locator("aside.orbita-sidebar").getByText("Unidade Teresina")).toBeVisible();

  // 7. Teresina aparece na lista de parceiros com cidade e tipo.
  await page.goto("/parceiros");
  const row = page.getByRole("link", { name: /Unidade Teresina/ });
  await expect(row).toContainText("Teresina/PI");
  await expect(row).toContainText("Ativo");
  await context.close();
});

test("convite inválido, expirado e recusa de cadastro", async ({ page, browser }) => {
  const run = fixtures();
  await page.goto("/convite/nao-e-um-convite");
  await expect(page.getByRole("heading", { level: 1, name: "Convite inválido" })).toBeVisible();

  // Convite expirado (inserido direto no banco com validade no passado).
  const admin = adminClient();
  const expiredSecret = "expirado-".padEnd(48, "x");
  const expired = await admin.from("invitations").insert({
    token_hash: createHash("sha256").update(expiredSecret).digest("hex"),
    partner_name: "Unidade Expirada",
    kind: "unit",
    expires_at: new Date(Date.now() - 60_000).toISOString(),
    created_by: run.director.id,
  });
  expect(expired.error).toBeNull();
  await page.goto(`/convite/${expiredSecret}`);
  await expect(page.getByRole("heading", { level: 1, name: "Convite expirado" })).toBeVisible();

  // Recusa: diretor gera convite, parceiro se cadastra, diretor recusa com motivo.
  await login(page, run.director.email, run.password);
  await page.goto("/parceiros");
  await page.getByLabel("Nome da unidade ou do indicador").fill("Indicador Recusado");
  await page.getByLabel(/^Tipo/).selectOption("external");
  await page.getByRole("button", { name: "Gerar convite" }).click();
  const link = await page.getByLabel("Link do convite").inputValue();
  const context = await browser.newContext();
  const partner = await context.newPage();
  await partner.goto(link);
  await partner.getByLabel("Nome do responsável").fill("João");
  await partner.getByLabel("E-mail de acesso").fill("recusado.e2e@fortespay.local");
  await partner.getByLabel("Senha (mínimo de 8 caracteres)").fill(run.password);
  await partner.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(partner).toHaveURL(/\/cadastro-em-analise$/);

  await page.goto("/parceiros");
  await page.getByRole("link", { name: /Indicador Recusado/ }).click();
  await page.getByLabel(/^Motivo da recusa/).fill("Fora da área de atuação.");
  await page.getByRole("button", { name: "Recusar cadastro" }).click();
  await expect(page.getByText("Recusado: Fora da área de atuação.")).toBeVisible();

  await partner.reload();
  await expect(
    partner.getByRole("heading", { level: 1, name: "Cadastro não aprovado" }),
  ).toBeVisible();
  await expect(partner.getByText("Motivo: Fora da área de atuação.")).toBeVisible();
  await context.close();
});
