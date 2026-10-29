// Casos que o roteiro não percorre: senha errada, convite expirado, planilha errada e CNPJ alfanumérico.
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { biExport } from "../tests/bi-export";
import {
  actor,
  adminClient,
  login,
  PASSWORD,
  resetAndSeedStaff,
  upload,
  type Staff,
} from "./helpers";

let staff: Staff;

test.beforeAll(async () => {
  staff = await resetAndSeedStaff({ director: "Diretor Extras", analyst: "Analista Extras" });
});

test("senha errada é recusada sem revelar detalhes", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(staff.director.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("convite expirado não abre o cadastro", async ({ page }) => {
  const secret = "expirado-".padEnd(48, "x");
  const inserted = await adminClient()
    .from("invitations")
    .insert({
      token_hash: createHash("sha256").update(secret).digest("hex"),
      partner_name: "Unidade Expirada",
      kind: "unit",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      created_by: staff.director.id,
    });
  expect(inserted.error).toBeNull();
  await page.goto(`/convite/${secret}`);
  await expect(page.getByRole("heading", { level: 1, name: "Convite expirado" })).toBeVisible();
});

test("planilha sem as colunas do BI é recusada com explicação", async ({ page }) => {
  await login(page, staff.analyst.email, PASSWORD);
  await upload(
    page,
    "estranha.xlsx",
    "2026-10",
    biExport([], "2026-10", { header: ["coluna1", "coluna2"] }),
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "Não encontrei a(s) coluna(s) cnpj, C. Cash-in" }),
  ).toBeVisible();
});

test("parceiro indica CNPJ alfanumérico", async ({ browser, baseURL }) => {
  const admin = adminClient();
  const partner = await admin
    .from("partners")
    .insert({
      name: "Unidade Alfa",
      kind: "unit",
      status: "active",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(partner.error).toBeNull();
  const user = await admin.auth.admin.createUser({
    email: "alfa.e2e@fortespay.local",
    password: PASSWORD,
    email_confirm: true,
  });
  expect(user.error).toBeNull();
  const profile = await admin.from("profiles").insert({
    user_id: user.data.user?.id ?? "",
    role: "partner",
    partner_id: partner.data?.id ?? "",
    display_name: "Responsável Alfa",
  });
  expect(profile.error).toBeNull();
  const page = await actor(browser, baseURL ?? "http://localhost:3100");
  await login(page, "alfa.e2e@fortespay.local", PASSWORD);
  await page.goto("/indicacoes");
  await page.getByLabel("CNPJ do cliente").fill("12.ABC.345/01DE-35");
  await page.getByLabel("Empresa", { exact: true }).fill("Empresa Alfanumérica");
  await page.getByRole("button", { name: "Registrar indicação" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Indicação registrada." })).toBeVisible();
  await expect(page.getByRole("row", { name: /Empresa Alfanumérica/ })).toContainText(
    "12.ABC.345/01DE-35",
  );
});
