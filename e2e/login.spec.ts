import { expect, test } from "@playwright/test";
import { fixtures, login } from "./helpers";

test("sem sessão, as áreas internas voltam para o login", async ({ page }) => {
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/importacoes");
  await expect(page).toHaveURL(/\/login$/);
});

test("diretor entra e vê a visão geral com a navegação completa", async ({ page }) => {
  const run = fixtures();
  await login(page, run.director.email, run.password);
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("link", { name: "Parceiros", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Importações", exact: true })).toBeVisible();
});

test("senha errada é recusada sem revelar detalhes", async ({ page }) => {
  const run = fixtures();
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(run.director.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("analista entra direto em importações e não vê parceiros", async ({ page }) => {
  const run = fixtures();
  await login(page, run.analyst.email, run.password);
  await expect(page).toHaveURL(/\/importacoes$/);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("link", { name: "Importações", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Parceiros", exact: true })).toHaveCount(0);
  await page.goto("/parceiros");
  await expect(page).toHaveURL(/\/importacoes$/);
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/importacoes$/);
});
