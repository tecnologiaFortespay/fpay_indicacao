// Casos que o roteiro não percorre: senha errada, convite expirado, planilha errada e CNPJ alfanumérico.
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cnpjWithDigits } from "@/lib/cnpj";
import { currentCompetency } from "@/lib/competency";
import { biExport } from "../tests/bi-export";
import { FAKE_IMPORT_SUMMARY, fakeRequests, resetFakeRequests } from "./fake-anthropic";
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

test("IA analisa o envio do diretor e aponta CNPJ possivelmente errado; analista não vê", async ({
  browser,
  baseURL,
}) => {
  const admin = adminClient();
  const referredCnpj = cnpjWithDigits("123456780001");
  const partner = await admin
    .from("partners")
    .insert({
      name: "Unidade IA",
      kind: "unit",
      status: "active",
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(partner.error).toBeNull();
  expect(
    (await admin.from("companies").insert({ cnpj: referredCnpj, name: "Padaria Pão Quente" }))
      .error,
  ).toBeNull();
  const referral = await admin.from("referrals").insert({
    partner_id: partner.data?.id ?? "",
    cnpj: referredCnpj,
    company_name: "Padaria Pão Quente",
    status: "negotiating",
    created_by: staff.director.id,
  });
  expect(referral.error).toBeNull();
  const month = currentCompetency();
  const sheet = biExport(
    [
      { cnpj: cnpjWithDigits("987654320001"), company: "PADARIA PAO QUENTE LTDA", lives: 12 },
      { cnpj: cnpjWithDigits("555666770001"), company: "OUTRA EMPRESA SA", lives: 30 },
    ],
    month,
  );
  await resetFakeRequests();

  const analyst = await actor(browser, baseURL ?? "http://localhost:3100");
  await login(analyst, staff.analyst.email, PASSWORD);
  await upload(analyst, "analista.xlsx", month, sheet);
  await expect(analyst).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
  await expect(analyst.getByRole("region", { name: "Análise da IA" })).toHaveCount(0);
  expect(await fakeRequests()).toHaveLength(0);

  const director = await actor(browser, baseURL ?? "http://localhost:3100");
  await login(director, staff.director.email, PASSWORD);
  await upload(director, "diretor.xlsx", month, sheet);
  await expect(director).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
  const panel = director.getByRole("region", { name: "Análise da IA" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(FAKE_IMPORT_SUMMARY)).toBeVisible({ timeout: 30000 });
  await expect(panel.getByText("CNPJ da indicação pode estar errado")).toBeVisible();

  const requests = await fakeRequests();
  expect(requests).toHaveLength(1);
  const { headers, body } = requests[0];
  expect(body.model).toBe("claude-opus-5-5");
  expect(String(headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
  expect(body.fallbacks).toBe("default");
  expect(body.output_config).toMatchObject({ effort: "medium", format: { type: "json_schema" } });
  const content = String((body.messages as { content: string }[])[0].content);
  expect(content).not.toContain("@");
  const material = JSON.parse(content);
  expect(material.envio).toMatch(/^parcial/);
  expect(material.possiveis_cnpj_errados).toEqual([
    expect.objectContaining({
      empresa: "Padaria Pão Quente",
      candidatos_no_arquivo: [expect.objectContaining({ empresa: "PADARIA PAO QUENTE LTDA" })],
    }),
  ]);

  await analyst.goto(director.url().replace(/^https?:\/\/[^/]+/, ""));
  await expect(analyst.getByText(FAKE_IMPORT_SUMMARY)).toHaveCount(0);
});
