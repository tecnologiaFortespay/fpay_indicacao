// Casos que o roteiro não percorre: senha errada, convite expirado, planilha errada, CNPJ
// alfanumérico, IA, links de nova senha e o comportamento das telas (formulário limpo, sessão
// expirada, convite aberto já conectado, página inexistente).
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
  staff = await resetAndSeedStaff({ director: "Diretor Extras", bi: "Equipe BI Extras" });
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
  await login(page, staff.bi.email, PASSWORD);
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
  // Os campos ficam limpos: um segundo clique não repete a indicação (o navegador pede o CNPJ).
  await expect(page.getByLabel("CNPJ do cliente")).toHaveValue("");
  await expect(page.getByLabel("Empresa", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Registrar indicação" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "CNPJ já indicado" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Empresa Alfanumérica/ })).toHaveCount(1);

  // Sessão que acaba com a tela aberta: salvar leva ao login com o aviso, em vez de "sem permissão".
  await page.context().clearCookies();
  await page.getByLabel("CNPJ do cliente").fill(cnpjWithDigits("246813570001"));
  await page.getByLabel("Empresa", { exact: true }).fill("Empresa Sem Sessão");
  await page.getByRole("button", { name: "Registrar indicação" }).click();
  await expect(page).toHaveURL(/\/login\?motivo=sessao$/);
  await expect(page.getByText("Sua sessão expirou. Entre de novo para continuar.")).toBeVisible();
});

test("convite aberto num navegador já conectado explica e oferece sair", async ({ page }) => {
  const secret = "conectado-".padEnd(48, "y");
  const inserted = await adminClient()
    .from("invitations")
    .insert({
      token_hash: createHash("sha256").update(secret).digest("hex"),
      partner_name: "Unidade Conectada",
      kind: "unit",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_by: staff.director.id,
    });
  expect(inserted.error).toBeNull();
  await login(page, staff.director.email, PASSWORD);
  await page.goto(`/convite/${secret}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Você já está conectado" }),
  ).toBeVisible();
  await expect(page.getByText(/Este convite é para Unidade Conectada/)).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto(`/convite/${secret}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Cadastro · Unidade Conectada" }),
  ).toBeVisible();
});

test("endereço inexistente mostra a página em português", async ({ page }) => {
  await login(page, staff.director.email, PASSWORD);
  for (const path of [
    "/pagina-que-nao-existe",
    "/parceiros/00000000-0000-4000-8000-000000000000",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir para o início" })).toBeVisible();
  }
});

test("IA analisa o envio de quem manda a planilha e aponta CNPJ possivelmente errado", async ({
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

  // Quem envia a planilha usa um login de diretor: o envio já pede a análise.
  const director = await actor(browser, baseURL ?? "http://localhost:3100");
  await login(director, staff.bi.email, PASSWORD);
  await upload(director, "bi.xlsx", month, sheet);
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
});

test("link de nova senha gerado sem e-mail (npm run reset-link) troca a senha", async ({
  page,
}) => {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "recovery",
    email: staff.bi.email,
  });
  expect(error).toBeNull();
  await page.goto(`/auth/confirm?token_hash=${data.properties?.hashed_token}&type=recovery`);
  await expect(page).toHaveURL(/\/redefinir-senha$/);
  await page.getByLabel("Nova senha (mínimo de 8 caracteres)").fill("Senha-nova-link-1");
  await page.getByLabel("Confirme a nova senha").fill("Senha-nova-link-1");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/login\?senha=alterada$/);
  await login(page, staff.bi.email, "Senha-nova-link-1");
  await expect(page).toHaveURL(/\/inicio$/);

  await page.context().clearCookies();
  await page.goto(`/auth/confirm?token_hash=${data.properties?.hashed_token}&type=recovery`);
  await expect(page).toHaveURL(/\/login\?erro=link$/);
});

test("diretor gera link de nova senha e o parceiro troca a senha por ele", async ({
  page,
  browser,
  baseURL,
}) => {
  const partner = await adminClient()
    .from("partners")
    .select("id")
    .eq("name", "Unidade Alfa")
    .single();
  expect(partner.error).toBeNull();
  await login(page, staff.director.email, PASSWORD);
  await page.goto(`/parceiros/${partner.data?.id}`);
  await page.getByRole("button", { name: "Gerar link de nova senha" }).click();
  const link = await page.getByLabel("Link de nova senha").inputValue();
  expect(link).toMatch(/\/nova-senha\/[A-Za-z0-9_-]{43}$/);

  const alfa = await actor(browser, baseURL ?? "http://localhost:3100");
  await alfa.goto(link);
  await expect(alfa.getByText(/alfa\.e2e@fortespay\.local/)).toBeVisible();
  await alfa.getByLabel("Nova senha (mínimo de 8 caracteres)").fill("Senha-alfa-nova-1");
  await alfa.getByLabel("Confirme a nova senha").fill("Senha-alfa-nova-1");
  await alfa.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(alfa).toHaveURL(/\/login\?senha=alterada$/);
  await login(alfa, "alfa.e2e@fortespay.local", "Senha-alfa-nova-1");
  await expect(alfa).toHaveURL(/\/inicio$/);

  await alfa.goto(link);
  await expect(alfa.getByRole("heading", { name: "Link inválido ou expirado" })).toBeVisible();

  // Aberto no navegador do próprio diretor (testando o link): a sessão dele termina e o login
  // mostra "Senha alterada", em vez de levar direto à Visão geral.
  await page.goto(`/parceiros/${partner.data?.id}`);
  await page.getByRole("button", { name: "Gerar link de nova senha" }).click();
  const second = await page.getByLabel("Link de nova senha").inputValue();
  await page.goto(second);
  await page.getByLabel("Nova senha (mínimo de 8 caracteres)").fill("Senha-alfa-nova-2");
  await page.getByLabel("Confirme a nova senha").fill("Senha-alfa-nova-2");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/login\?senha=alterada$/);
  await expect(page.getByText("Senha alterada", { exact: false }).first()).toBeVisible();
  await login(page, "alfa.e2e@fortespay.local", "Senha-alfa-nova-2");
  await expect(page).toHaveURL(/\/inicio$/);
});
