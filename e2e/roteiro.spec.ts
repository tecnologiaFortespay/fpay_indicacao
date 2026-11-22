// Roteiro de validação do MVP (docs/roteiro-validacao.md), executado passo a passo.
// Mesma sequência que o Denis segue à mão, com exports sintéticos no formato do BI (tests/bi-export.ts).
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { cnpjWithDigits, formatCnpj } from "@/lib/cnpj";
import {
  addMonths,
  competencyLabel,
  currentCompetency,
  shortCompetencyLabel,
} from "@/lib/competency";
import { biExport, biExportCsv, type ExportRow } from "../tests/bi-export";
import { FAKE_CLOSING_SUMMARY, fakeRequests, resetFakeRequests } from "./fake-anthropic";
import {
  actor,
  clean,
  clearMailbox,
  login,
  mailsTo,
  openDisclosure,
  PASSWORD,
  resetAndSeedStaff,
  submitIn,
  upload,
  waitForMail,
} from "./helpers";

// O roteiro foi escrito com hoje em outubro de 2026. Aqui os meses são relativos a hoje, para o
// teste valer em qualquer mês: AUG = dois meses atrás, SEP = mês anterior, OCT = mês corrente.
const OCT = currentCompetency();
const SEP = addMonths(OCT, -1);
const AUG = addMonths(OCT, -2);
const NOV = addMonths(OCT, 1);
const AUG_LABEL = competencyLabel(AUG);
const SEP_LABEL = competencyLabel(SEP);
const OCT_LABEL = competencyLabel(OCT);
const AUG_NUMERIC = `${AUG.slice(5, 7)}/${AUG.slice(0, 4)}`;

type Company = { cnpj: string; company: string; group: string };

function company(base: string, name: string, group: string): Company {
  return { cnpj: formatCnpj(cnpjWithDigits(base)), company: name, group };
}

const A = company("112223330001", "Empresa A Ltda", "Grupo A");
const B = company("445556660001", "Empresa B Ltda", "Grupo B");
const C = company("556667770001", "Empresa C Ltda", "Grupo C");
const D = company("667778880001", "Empresa D Ltda", "Grupo D");
const E = company("778889990001", "Empresa E Ltda", "Grupo E");
const F = company("889990001001", "Empresa F Ltda", "Grupo F");
// Empresa nova, indicada e paga pela primeira vez no mês corrente (bloco 15).
const G = company("990001112001", "Empresa G Ltda", "Grupo G");
// Empresa indicada pelo vendedor da Unidade Teresina (bloco 16).
const H = company("121314150001", "Empresa H Ltda", "Grupo H");
const SELLER_EMAIL = "carla.e2e@fortespay.local";

// Clientes da Fortes Pay que não foram indicados (ficam "fora da plataforma") e duas linhas inválidas.
const OTHERS: ExportRow[] = Array.from({ length: 8 }, (_, index) => ({
  cnpj: formatCnpj(cnpjWithDigits(String(900000000001 + index * 1000))),
  company: `Cliente ${index + 1}`,
  lives: 5 + index,
  group: "Outros clientes",
}));
const INVALID: ExportRow[] = [
  { cnpj: "12345678901234", company: "Linha com CPF", lives: 3, group: "Pessoa física" },
  { cnpj: "11111111111111", company: "Documento repetido", lives: 2, group: "Pessoa física" },
];

function exportFor(
  month: string,
  lives: Partial<Record<"A" | "B" | "D" | "E", number>>,
  format: "xlsx" | "csv" = "xlsx",
  extra: ExportRow[] = [],
) {
  const referred: ExportRow[] = [];
  for (const [key, entry] of [
    ["A", A],
    ["B", B],
    ["D", D],
    ["E", E],
  ] as const) {
    const value = lives[key];
    if (value !== undefined) {
      referred.push({ cnpj: entry.cnpj, company: entry.company, lives: value, group: entry.group });
    }
  }
  const all = [...referred, ...extra, ...OTHERS, ...INVALID];
  return format === "csv" ? biExportCsv(all, month) : biExport(all, month);
}

const AUGUST = exportFor(AUG, { A: 30, B: 20, D: 50, E: 10 });
const SEPTEMBER = exportFor(SEP, { A: 33, B: 22, D: 55, E: 12 });
const SEPTEMBER_A8 = exportFor(SEP, { A: 41, B: 22, D: 55, E: 12 });
const OCTOBER = exportFor(OCT, { A: 37, D: 58, E: 23 });
// Envio parcial seguinte do mesmo mês: A fechou mais vidas. Vem em CSV, como o Google Planilhas
// exporta (nomes só nos subtotais, números com ponto de milhar).
const OCTOBER_UPDATE = exportFor(OCT, { A: 40, D: 58, E: 23 }, "csv");

// Envio parcial seguinte: entra a empresa G, nova, com 15 vidas (bloco 15).
const OCTOBER_WITH_G = exportFor(OCT, { A: 40, D: 58, E: 23 }, "xlsx", [
  { cnpj: G.cnpj, company: G.company, lives: 15, group: G.group },
]);

// Envio parcial seguinte: entra também a empresa H, indicada pelo vendedor, com 9 vidas (bloco 16).
const OCTOBER_WITH_H = exportFor(OCT, { A: 40, D: 58, E: 23 }, "xlsx", [
  { cnpj: G.cnpj, company: G.company, lives: 15, group: G.group },
  { cnpj: H.cnpj, company: H.company, lives: 9, group: H.group },
]);

const NEW_PASSWORD = "Nova-senha-e2e-999";

function section(page: Page, heading: string | RegExp) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
}

async function navLabels(page: Page): Promise<string[]> {
  return page
    .locator('nav[aria-label="Navegação principal"] a')
    .evaluateAll((links) => links.map((link) => link.getAttribute("aria-label") ?? ""));
}

async function rowText(page: Page, name: string | RegExp): Promise<string> {
  const row = page
    .getByRole("row", { name: typeof name === "string" ? new RegExp(name) : name })
    .first();
  await expect(row).toBeVisible();
  return clean(await row.innerText());
}

type Registration = {
  name: string;
  contact: string;
  city: string;
  state: string;
  phone: string;
  email: string;
};

// Cadastro aberto (decisão 25): o parceiro cria a própria conta em /cadastro, sem convite.
async function fillRegistration(page: Page, data: Registration, confirmation = PASSWORD) {
  await page.getByLabel("Nome da unidade ou do parceiro").fill(data.name);
  await page.getByLabel("Cidade").fill(data.city);
  await page.getByLabel("UF").fill(data.state);
  await page.getByLabel("Nome do responsável").fill(data.contact);
  await page.getByLabel("Telefone").fill(data.phone);
  await page.getByLabel("E-mail de acesso").fill(data.email);
  await page.getByLabel("Senha (mínimo de 8 caracteres)").fill(PASSWORD);
  await page.getByLabel("Confirmar senha").fill(confirmation);
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
}

async function register(page: Page, data: Registration) {
  await page.goto("/cadastro");
  await fillRegistration(page, data);
  await expect(page).toHaveURL(/\/cadastro-em-analise$/);
}

async function openPending(director: Page, name: string): Promise<string> {
  await director.goto("/parceiros");
  await section(director, "Aguardando aprovação")
    .getByRole("link", { name: new RegExp(name) })
    .click();
  await expect(director).toHaveURL(/\/parceiros\/[0-9a-f-]{36}$/);
  return director.url().split("/").pop() ?? "";
}

async function approve(
  director: Page,
  rule: { kind: string; value: string; from: string; term: string },
) {
  await director.getByLabel("Tipo de parceiro").selectOption({ label: rule.kind });
  await director.getByLabel("Valor por vida (R$)").fill(rule.value);
  await director.getByLabel("Vale a partir de").fill(rule.from);
  await director.getByLabel("Prazo (meses)").fill(rule.term);
  await director.getByRole("button", { name: "Aprovar e liberar acesso" }).click();
  await expect(
    director
      .getByRole("status")
      .filter({ hasText: "Parceiro aprovado. O acesso dele está liberado." }),
  ).toBeVisible();
  await expect(director.getByRole("heading", { name: "Regra de remuneração" })).toBeVisible();
  return clean(await section(director, "Regra de remuneração").locator("tbody").innerText());
}

// Parceiro ou vendedor registra a indicação. Não há campo de vendedor (decisão 29): o sistema grava
// o e-mail da conta que registra.
async function refer(page: Page, entry: Company, estimated?: string) {
  await page.goto("/indicacoes");
  const form = await openDisclosure(page, "Nova indicação");
  await expect(form.getByLabel("Vendedor", { exact: true })).toHaveCount(0);
  await form.getByLabel("CNPJ do cliente").fill(entry.cnpj);
  await form.getByLabel("Empresa", { exact: true }).fill(entry.company);
  if (estimated) {
    await form.getByLabel("Vidas estimadas").fill(estimated);
  }
  await submitIn(form, "Registrar indicação").click();
}

async function changeStatus(director: Page, entry: Company, status: string, label: string) {
  await director.goto("/indicacoes");
  const row = director.getByRole("row", { name: new RegExp(entry.company) });
  await row.getByLabel(`Nova situação de ${entry.company}`).selectOption(status);
  await row.getByRole("button", { name: "Alterar" }).click();
  await expect(
    director.getByRole("status").filter({ hasText: "Situação atualizada." }),
  ).toBeVisible();
  await expect(director.getByRole("row", { name: new RegExp(entry.company) })).toContainText(label);
}

async function statusOptions(director: Page, entry: Company): Promise<string[]> {
  await director.goto("/indicacoes");
  return director
    .getByRole("row", { name: new RegExp(entry.company) })
    .getByLabel(`Nova situação de ${entry.company}`)
    .locator("option")
    .allInnerTexts();
}

async function batchSummary(page: Page) {
  await expect(page).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
  const text = clean(await page.locator(".fp-facts").innerText());
  const number = (label: string) => Number(text.match(new RegExp(`${label} (\\d+)`))?.[1]);
  return {
    read: number("Linhas lidas"),
    imported: number("Importadas"),
    skipped: number("Fora da plataforma"),
    ignored: number("Ignoradas"),
  };
}

function minuteOf(time: number): number {
  return Math.floor(time / 60000);
}

test("roteiro de validação do MVP", async ({ browser, request, baseURL }) => {
  test.setTimeout(15 * 60 * 1000);
  const base = baseURL ?? "http://localhost:3100";
  const staff = await resetAndSeedStaff({
    director: "Diretor Roteiro",
    bi: "Equipe BI Roteiro",
  });
  const anon = await actor(browser, base);
  const dir = await actor(browser, base);
  // Quem envia a planilha do BI usa um login de diretor próprio (decisão 14).
  const bi = await actor(browser, base);
  const ter = await actor(browser, base);
  const nat = await actor(browser, base);
  const con = await actor(browser, base);
  const rec = await actor(browser, base);
  const pen = await actor(browser, base);
  // Vendedor da Unidade Teresina (bloco 16).
  const ven = await actor(browser, base);
  const ids: Record<string, string> = {};
  let septemberAt = 0;

  await test.step("1.1 sem login, as áreas internas levam ao login", async () => {
    for (const path of ["/", "/inicio", "/parceiros", "/fechamento"]) {
      await anon.goto(path);
      await expect(anon).toHaveURL(/\/login$/);
    }
  });

  await test.step("1.2 diretor cai em Visão geral com o menu completo", async () => {
    await login(dir, staff.director.email, PASSWORD);
    await expect(dir).toHaveURL(/\/inicio$/);
    await expect(dir.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
    expect(await navLabels(dir)).toEqual([
      "Visão geral",
      "Parceiros",
      "Indicações",
      "Importações",
      "Fechamento do mês",
      "Equipe",
    ]);
  });

  await test.step("1.3 senha errada é recusada sem dizer qual campo errou", async () => {
    await anon.goto("/login");
    await anon.getByLabel("E-mail", { exact: true }).fill(staff.director.email);
    await anon.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
    await anon.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      anon.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." }),
    ).toBeVisible();
    await login(bi, staff.bi.email, PASSWORD);
    await expect(bi).toHaveURL(/\/inicio$/);
  });

  await test.step("2.1 sem Novo parceiro e sem convite; o cadastro abre pela tela de entrada", async () => {
    await dir.goto("/parceiros");
    await expect(dir.getByText("Novo parceiro")).toHaveCount(0);
    await expect(dir.getByText("Gerar convite")).toHaveCount(0);
    await expect(dir.getByRole("heading", { name: "Convites" })).toHaveCount(0);
    await expect(section(dir, "Aguardando aprovação")).toContainText(`${base}/cadastro`);
    await ter.goto("/login");
    await ter.getByRole("link", { name: "Solicitar criação de conta" }).click();
    await expect(ter).toHaveURL(/\/cadastro$/);
    await expect(
      ter.getByRole("heading", { level: 1, name: "Criar conta de parceiro" }),
    ).toBeVisible();
    // O telefone ganha a máscara (DDD) 9XXXX-XXXX enquanto é digitado.
    const phone = ter.getByLabel("Telefone");
    await phone.pressSequentially("86999990000");
    await expect(phone).toHaveValue("(86) 99999-0000");
  });

  await test.step("2.2 confirmação de senha diferente é recusada; cadastro certo fica em análise, inclusive em /inicio", async () => {
    const teresina = {
      name: "Unidade Teresina",
      contact: "Maria Teresina",
      city: "Teresina",
      state: "PI",
      phone: "(86) 99999-0000",
      email: "teresina.e2e@fortespay.local",
    };
    await fillRegistration(ter, teresina, "Senha-diferente-123");
    await expect(
      ter.getByRole("alert").filter({ hasText: "As senhas precisam ser iguais." }),
    ).toBeVisible();
    await expect(ter).toHaveURL(/\/cadastro$/);
    await register(ter, teresina);
    await expect(ter.getByRole("heading", { level: 1, name: "Cadastro em análise" })).toBeVisible();
    await ter.goto("/inicio");
    await expect(ter).toHaveURL(/\/cadastro-em-analise$/);
    // O cadastro chega sem o diretor ter pedido: a Visão geral avisa e leva a Parceiros.
    await dir.goto("/inicio");
    await expect(dir.getByText("1 cadastro de parceiro aguardando aprovação")).toBeVisible();
    await dir.getByRole("link", { name: "Analisar em Parceiros" }).click();
    await expect(dir).toHaveURL(/\/parceiros$/);
    // Com o cadastro feito, a tela de criar conta leva de volta ao aviso de análise.
    await ter.goto("/cadastro");
    await expect(ter).toHaveURL(/\/cadastro-em-analise$/);
  });

  await test.step("2.3 o mesmo e-mail não cria outra conta; link de convite que não existe é recusado", async () => {
    await anon.goto("/cadastro");
    await anon.getByLabel("Nome da unidade ou do parceiro").fill("Unidade Repetida");
    await anon.getByLabel("Cidade").fill("Teresina");
    await anon.getByLabel("UF").fill("PI");
    await anon.getByLabel("Nome do responsável").fill("Outra Pessoa");
    await anon.getByLabel("Telefone").fill("(86) 90000-0000");
    await anon.getByLabel("E-mail de acesso").fill("teresina.e2e@fortespay.local");
    await anon.getByLabel("Senha (mínimo de 8 caracteres)").fill("Outra-senha-12345");
    await anon.getByLabel("Confirmar senha").fill("Outra-senha-12345");
    await anon.getByRole("button", { name: "Enviar cadastro" }).click();
    await expect(
      anon.getByRole("alert").filter({ hasText: "Este e-mail já tem conta." }),
    ).toBeVisible();
    await anon.goto(`/convite/${"A".repeat(43)}`);
    await expect(anon.getByRole("heading", { level: 1, name: "Convite inválido" })).toBeVisible();
    await dir.goto("/parceiros");
    await expect(
      section(dir, "Aguardando aprovação").getByRole("link", { name: /Unidade Repetida/ }),
    ).toHaveCount(0);
  });

  await test.step("2.4 aprovar sem tipo ou sem valor por vida é bloqueado", async () => {
    ids.teresina = await openPending(dir, "Unidade Teresina");
    // O cadastro aberto chega sem tipo: o diretor escolhe ao aprovar.
    await expect(dir.locator(".fp-facts")).toContainText("a escolher na aprovação");
    await dir.getByRole("button", { name: "Aprovar e liberar acesso" }).click();
    const kind = dir.getByLabel("Tipo de parceiro");
    expect(await kind.evaluate((input: HTMLSelectElement) => input.validity.valueMissing)).toBe(
      true,
    );
    await kind.selectOption({ label: "Unidade" });
    await dir.getByRole("button", { name: "Aprovar e liberar acesso" }).click();
    const value = dir.getByLabel("Valor por vida (R$)");
    expect(await value.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(
      true,
    );
    await expect(dir.getByRole("heading", { name: "Aprovar o cadastro" })).toBeVisible();
  });

  await test.step("2.5 aprovar como Unidade, 1,50 desde agosto, sem prazo: ficha Ativo", async () => {
    const rules = await approve(dir, { kind: "Unidade", value: "1,50", from: AUG, term: "" });
    expect(rules).toContain(`${AUG_LABEL} R$ 1,50 sem prazo`);
    await expect(dir.locator(".fp-facts")).toContainText("Ativo");
    await expect(dir.locator(".fp-facts")).toContainText("Unidade");
  });

  await test.step("2.6 o parceiro recarrega e entra em Meu painel", async () => {
    await ter.goto("/cadastro-em-analise");
    await ter.reload();
    await expect(ter).toHaveURL(/\/inicio$/);
    await expect(ter.getByRole("heading", { level: 1, name: "Meu painel" })).toBeVisible();
    await expect(ter.locator(".fp-page-intro")).toContainText("Unidade Teresina");
  });

  await test.step("2.7 Unidade Natal: 2,00 desde agosto, sem prazo", async () => {
    await register(nat, {
      name: "Unidade Natal",
      contact: "João Natal",
      city: "Natal",
      state: "RN",
      phone: "(84) 98888-0000",
      email: "natal.e2e@fortespay.local",
    });
    ids.natal = await openPending(dir, "Unidade Natal");
    expect(await approve(dir, { kind: "Unidade", value: "2,00", from: AUG, term: "" })).toContain(
      `${AUG_LABEL} R$ 2,00 sem prazo`,
    );
    await nat.reload();
    await expect(nat).toHaveURL(/\/inicio$/);
  });

  await test.step("2.8 Contador Fulano, Parceiro externo: 1,50 desde agosto, 12 meses", async () => {
    await register(con, {
      name: "Contador Fulano",
      contact: "Fulano de Tal",
      city: "Fortaleza",
      state: "CE",
      phone: "(85) 97777-0000",
      email: "contador.e2e@fortespay.local",
    });
    ids.contador = await openPending(dir, "Contador Fulano");
    expect(
      await approve(dir, { kind: "Parceiro externo", value: "1,50", from: AUG, term: "12" }),
    ).toContain(`${AUG_LABEL} R$ 1,50 12 meses`);
    await expect(dir.locator(".fp-facts")).toContainText("Parceiro externo");
    await con.reload();
    await expect(con).toHaveURL(/\/inicio$/);
  });

  await test.step("2.9 recusa com motivo; fora da lista de ativos", async () => {
    await register(rec, {
      name: "Unidade Recusa",
      contact: "Pedro Recusa",
      city: "Recife",
      state: "PE",
      phone: "(81) 96666-0000",
      email: "recusa.e2e@fortespay.local",
    });
    ids.recusa = await openPending(dir, "Unidade Recusa");
    await dir.getByLabel("Motivo da recusa").fill("Documentação incompleta.");
    await dir.getByRole("button", { name: "Recusar cadastro" }).click();
    await expect(
      dir
        .getByRole("status")
        .filter({ hasText: "Cadastro recusado. O parceiro vê o motivo ao entrar." }),
    ).toBeVisible();
    await expect(dir.getByText("Motivo: Documentação incompleta.")).toBeVisible();
    await expect(
      dir.getByRole("heading", { name: "Reconsiderar: aprovar o cadastro" }),
    ).toBeVisible();
    await rec.reload();
    await expect(
      rec.getByRole("heading", { level: 1, name: "Cadastro não aprovado" }),
    ).toBeVisible();
    await expect(rec.getByText("Motivo: Documentação incompleta.")).toBeVisible();
    await dir.goto("/parceiros");
    await expect(
      section(dir, /^Ativos \(/).getByRole("link", { name: /Unidade Recusa/ }),
    ).toHaveCount(0);
    await expect(
      section(dir, /^Ativos \(/).getByRole("link", { name: /Unidade Teresina/ }),
    ).toBeVisible();
    await expect(
      section(dir, /^Recusados \(/).getByRole("link", { name: /Unidade Recusa/ }),
    ).toBeVisible();
  });

  await test.step("2.10 nova vigência de 1,80 em outubro; a de agosto não tem editar", async () => {
    await dir.goto(`/parceiros/${ids.teresina}`);
    const form = await openDisclosure(dir, "Nova vigência");
    await form.getByLabel("Valor por vida (R$)").fill("1,80");
    await form.getByLabel("Vale a partir de").fill(OCT);
    await submitIn(form, "Salvar nova vigência").click();
    await expect(dir.getByRole("status").filter({ hasText: "Regra salva." })).toBeVisible();
    const rules = section(dir, "Regra de remuneração");
    const august = rules.getByRole("row", { name: new RegExp(AUG_LABEL) });
    const october = rules.getByRole("row", { name: new RegExp(OCT_LABEL) });
    await expect(august).toContainText("R$ 1,50");
    await expect(october).toContainText("R$ 1,80");
    await expect(august).toContainText("não, histórico");
    await expect(october).toContainText("sim, é a mais recente");
    await expect(rules.locator("summary", { hasText: /^Editar a vigência de / })).toHaveCount(1);
    await expect(rules.getByText(/^Hoje: /)).toContainText("R$ 1,80 por vida · sem prazo");
  });

  await test.step("2.11 a ficha do parceiro é só leitura, sem ação de regra", async () => {
    await ter.goto("/inicio");
    expect(await navLabels(ter)).toContain("Meu cadastro");
    await ter.goto("/meu-cadastro");
    await expect(ter.getByRole("heading", { level: 1, name: "Meu cadastro" })).toBeVisible();
    await expect(ter.locator(".fp-facts")).toContainText("Unidade Teresina");
    await expect(ter.getByRole("row", { name: new RegExp(AUG_LABEL) })).toContainText("R$ 1,50");
    await expect(ter.getByRole("row", { name: new RegExp(OCT_LABEL) })).toContainText("R$ 1,80");
    await expect(ter.locator("main input, main select, main textarea")).toHaveCount(0);
    await ter.goto(`/parceiros/${ids.teresina}`);
    await expect(ter).toHaveURL(/\/inicio$/);
  });

  await test.step("3.1 Teresina indica A: Indicada, com data e o e-mail da unidade como vendedor", async () => {
    // Decisão 29 (22/11/2026): o vendedor da indicação é o e-mail da conta que registra.
    await refer(ter, A, "40");
    await expect(
      ter.getByRole("status").filter({ hasText: "Indicação registrada." }),
    ).toBeVisible();
    const today = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza" }).format(
      new Date(),
    );
    const row = await rowText(ter, A.company);
    expect(row).toContain("Indicada");
    expect(row).toContain(today);
    expect(row).toContain("Vendedor: teresina.e2e@fortespay.local");
  });

  await test.step("3.2 a 3.4 Teresina indica B e C; Natal indica D; Contador indica E", async () => {
    for (const [page, entry] of [
      [ter, B],
      [ter, C],
      [nat, D],
      [con, E],
    ] as const) {
      await refer(page, entry);
      await expect(
        page.getByRole("status").filter({ hasText: "Indicação registrada." }),
      ).toBeVisible();
    }
  });

  await test.step("3.5 Natal tenta A: data sem o nome de Teresina, nada gravado", async () => {
    await refer(nat, A);
    const alert = nat.getByRole("alert").filter({ hasText: "CNPJ já indicado em" });
    await expect(alert).toHaveText(/^CNPJ já indicado em \d{2}\/\d{2}\/\d{4}\.$/);
    await nat.goto("/indicacoes");
    await expect(nat.getByRole("heading", { name: "Ainda não rende (1)" })).toBeVisible();
  });

  await test.step("3.6 diretor vê as 5 com o parceiro; registrar A por Natal cita Teresina", async () => {
    await dir.goto("/indicacoes");
    await expect(section(dir, "Lista").locator("tbody tr")).toHaveCount(5);
    for (const [entry, partner] of [
      [A, "Unidade Teresina"],
      [B, "Unidade Teresina"],
      [C, "Unidade Teresina"],
      [D, "Unidade Natal"],
      [E, "Contador Fulano"],
    ] as const) {
      expect(await rowText(dir, entry.company)).toContain(partner);
    }
    expect(await rowText(dir, A.company)).toContain("Vendedor: teresina.e2e@fortespay.local");
    // Busca por empresa e por CNPJ (item 4 da reunião de 09/11/2026): acha só a indicação certa.
    await dir.getByLabel("Buscar por CNPJ ou empresa").fill(A.company.toLowerCase());
    await dir.getByRole("button", { name: "Filtrar" }).click();
    await expect(section(dir, "Lista").locator("tbody tr")).toHaveCount(1);
    await expect(section(dir, "Lista").locator("tbody tr").first()).toContainText(A.company);
    await dir.getByLabel("Buscar por CNPJ ou empresa").fill(B.cnpj);
    await dir.getByRole("button", { name: "Filtrar" }).click();
    await expect(section(dir, "Lista").locator("tbody tr")).toHaveCount(1);
    await expect(section(dir, "Lista").locator("tbody tr").first()).toContainText(B.company);
    await dir.goto("/indicacoes");
    await expect(section(dir, "Lista").locator("tbody tr")).toHaveCount(5);
    const form = await openDisclosure(dir, "Registrar indicação em nome de um parceiro");
    await form.locator("select[name=partner_id]").selectOption({ label: "Unidade Natal" });
    await form.getByLabel("CNPJ do cliente").fill(A.cnpj);
    await form.getByLabel("Empresa", { exact: true }).fill(A.company);
    await submitIn(form, "Registrar indicação").click();
    await expect(dir.getByRole("alert").filter({ hasText: "por Unidade Teresina." })).toBeVisible();
  });

  await test.step("3.7 A: Indicada, Em negociação, Fechada; só transições permitidas", async () => {
    expect(await statusOptions(dir, A)).toEqual(["Em negociação", "Fechada", "Perdida"]);
    await changeStatus(dir, A, "negotiating", "Em negociação");
    expect(await statusOptions(dir, A)).toEqual(["Fechada", "Perdida"]);
    await changeStatus(dir, A, "signed", "Fechada");
  });

  await test.step("3.8 C Perdida", async () => {
    await changeStatus(dir, C, "lost", "Perdida");
  });

  await test.step("3.9 Teresina vê A Fechada e C Perdida, sem mudar status", async () => {
    await ter.goto("/indicacoes");
    expect(await rowText(ter, A.company)).toContain("Contrato fechado");
    expect(await rowText(ter, A.company)).toContain("Começa a render no primeiro mês");
    expect(await rowText(ter, C.company)).toContain("Perdida");
    await expect(ter.getByRole("heading", { name: "Encerradas (1)" })).toBeVisible();
    await expect(ter.getByRole("button", { name: "Alterar" })).toHaveCount(0);
  });

  await test.step("3.10 Natal vê só D", async () => {
    await nat.goto("/indicacoes");
    const rows = nat.locator("main tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(D.company);
  });

  // Item 3 da reunião de 09/11/2026 (decisão 20): sem nenhuma vida paga, o parceiro ainda vê
  // quantas indicações viraram cliente (A, contrato fechado), quantas andam (B) e quantas perdeu (C).
  await test.step("3.11 Teresina vê quantas viraram cliente, mesmo sem vida paga", async () => {
    const sentence = "3 indicações · 1 virou cliente · 1 em andamento · 1 perdida";
    await ter.goto("/indicacoes");
    const summary = clean(await section(ter, "Resumo").innerText());
    expect(summary).toContain(sentence);
    expect(summary).toContain("1 Viraram cliente");
    expect(summary).toContain("1 Em andamento");
    expect(summary).toContain("1 Perdidas");
    await ter.goto("/inicio");
    await expect(ter.getByText(`Nenhuma vida paga em ${OCT_LABEL}.`)).toBeVisible();
    await expect(ter.getByText(sentence).first()).toBeVisible();
    // Item 5: sem envio do mês, o painel diz isso em vez de mostrar a data de outro mês.
    await expect(ter.getByText(`Ainda não houve envio da planilha de ${OCT_LABEL}.`)).toBeVisible();
  });

  // Item 1 (decisão 22): só o diretor corrige o vendedor depois, na ficha da indicação.
  await test.step("3.12 diretor corrige o vendedor de B na ficha da indicação", async () => {
    await dir.goto("/indicacoes");
    await dir.getByRole("link", { name: B.company, exact: true }).click();
    await expect(dir).toHaveURL(/\/indicacoes\/[0-9a-f-]{36}$/);
    await dir.getByLabel("Vendedor", { exact: true }).fill("Bruno");
    await dir.getByRole("button", { name: "Salvar vendedor" }).click();
    await expect(dir.getByRole("status").filter({ hasText: "Vendedor salvo." })).toBeVisible();
    await dir.goto("/indicacoes");
    expect(await rowText(dir, B.company)).toContain("Vendedor: Bruno");
  });

  await test.step("4.0 conferência antes de gravar: o que muda em cada indicação; nada gravado", async () => {
    await upload(bi, "Detalhamento Empresas - agosto.xlsx", AUG, AUGUST, { confirm: false });
    const preview = bi.getByRole("region", { name: "Conferência do envio" });
    await expect(preview.locator(".fp-facts")).toContainText(/Indicações no arquivo\s*4/);
    await expect(preview.locator(".fp-facts")).toContainText(/Fora da plataforma\s*8/);
    await expect(
      preview.getByRole("heading", { name: "Indicações que estão no arquivo (4)" }),
    ).toBeVisible();
    // A estava Fechada e passa a Ativa com 30 vidas × R$ 1,50.
    const a = preview.getByRole("row", { name: new RegExp(A.company) });
    await expect(a).toContainText("Fechada");
    await expect(a).toContainText("Ativa");
    await expect(a).toContainText("R$ 45,00");
    await expect(preview.getByRole("row", { name: /^Unidade Teresina/ })).toContainText("R$ 75,00");
    await preview.getByRole("button", { name: "Cancelar" }).click();
    await expect(preview).toHaveCount(0);
    await bi.goto("/importacoes");
    await expect(bi.locator("a.fp-action-row")).toHaveCount(0);
  });

  await test.step("4.1 export de agosto: importadas só A, B, D, E; o resto fora da plataforma", async () => {
    await upload(bi, "Detalhamento Empresas - agosto.xlsx", AUG, AUGUST);
    expect(await batchSummary(bi)).toEqual({ read: 14, imported: 4, skipped: 8, ignored: 2 });
    await expect(bi.getByRole("cell", { name: "CNPJ inválido." })).toHaveCount(2);
  });

  await test.step("4.2 export de agosto informado como setembro é recusado", async () => {
    await upload(bi, "Detalhamento Empresas - agosto.xlsx", SEP, AUGUST);
    await expect(
      bi.getByRole("alert").filter({
        hasText: `O arquivo é de ${AUG_LABEL}, mas o mês escolhido foi ${SEP_LABEL}.`,
      }),
    ).toBeVisible();
  });

  await test.step("4.3 agosto de novo: lote novo, mesmas vidas", async () => {
    await upload(bi, "Detalhamento Empresas - agosto.xlsx", AUG, AUGUST);
    expect((await batchSummary(bi)).imported).toBe(4);
  });

  await test.step("4.4 export de setembro", async () => {
    await upload(bi, "Detalhamento Empresas - setembro.xlsx", SEP, SEPTEMBER);
    septemberAt = Date.now();
    expect(await batchSummary(bi)).toEqual({ read: 14, imported: 4, skipped: 8, ignored: 2 });
  });

  await test.step("4.5 novembro (futuro) é recusado", async () => {
    await bi.goto("/importacoes");
    const month = bi.getByLabel("Mês de referência", { exact: true });
    await month.fill(NOV);
    await bi.getByLabel("Planilha do BI", { exact: true }).setInputFiles({
      name: "novembro.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(SEPTEMBER),
    });
    await bi.getByRole("button", { name: "Conferir arquivo", exact: true }).click();
    expect(await month.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(
      true,
    );
    await month.evaluate((input: HTMLInputElement) => input.removeAttribute("max"));
    await bi.getByRole("button", { name: "Conferir arquivo", exact: true }).click();
    await expect(
      bi.getByRole("alert").filter({ hasText: "O mês de referência não pode ser um mês futuro." }),
    ).toBeVisible();
  });

  await test.step("4.6 diretor vê os lotes com data, hora e quem enviou", async () => {
    await dir.goto("/importacoes");
    const batches = dir.locator("a.fp-action-row");
    await expect(batches).toHaveCount(3);
    await expect(batches.first()).toContainText(
      /\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2} · Equipe BI Roteiro/,
    );
    await batches.first().click();
    await expect(dir).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
  });

  await test.step("4.7 A, B, D, E Ativa com o primeiro mês pago; C Perdida", async () => {
    await dir.goto("/indicacoes");
    for (const entry of [A, B, D, E]) {
      const row = await rowText(dir, entry.company);
      expect(row).toContain("Ativa");
      expect(row).toContain(shortCompetencyLabel(AUG));
    }
    expect(await rowText(dir, C.company)).toContain("Perdida");
  });

  await test.step("5.1 visão geral de agosto: vidas × valor por parceiro e carimbo", async () => {
    await dir.goto(`/inicio?competency=${AUG}`);
    expect(await rowText(dir, "Unidade Teresina")).toContain("50 R$ 1,50 R$ 75,00");
    expect(await rowText(dir, "Unidade Natal")).toContain("50 R$ 2,00 R$ 100,00");
    expect(await rowText(dir, "Contador Fulano")).toContain("10 R$ 1,50 R$ 15,00");
    expect(clean(await dir.locator("tfoot").innerText())).toContain("Total 110 R$ 190,00");
    await expect(
      dir.getByText(/Planilha do BI enviada em .* por Equipe BI Roteiro\./),
    ).toBeVisible();
  });

  await test.step("5.2 setembro recalculado", async () => {
    await dir.goto(`/inicio?competency=${SEP}`);
    expect(await rowText(dir, "Unidade Teresina")).toContain("55 R$ 1,50 R$ 82,50");
    expect(await rowText(dir, "Unidade Natal")).toContain("55 R$ 2,00 R$ 110,00");
    expect(await rowText(dir, "Contador Fulano")).toContain("12 R$ 1,50 R$ 18,00");
    expect(clean(await dir.locator("tfoot").innerText())).toContain("Total 122 R$ 210,50");
  });

  await test.step("5.3 painel de Teresina em agosto: só A e B, com o total e o saldo no cartão", async () => {
    // O seletor de mês troca o mês assim que é escolhido, sem botão.
    await ter.goto("/inicio");
    await expect(ter.getByRole("button", { name: "Ver mês" })).toHaveCount(0);
    await ter.getByLabel("Mês", { exact: true }).fill(AUG);
    await expect(ter).toHaveURL(new RegExp(`/inicio\\?competency=${AUG}$`));
    const month = clean(await section(ter, `${AUG_LABEL} · prévia`).innerText());
    expect(month).toContain(
      `Regra para quem você indicar em ${AUG_LABEL}: R$ 1,50 por vida · sem prazo.`,
    );
    expect(month).toContain("Vidas pagas no mês inteiro 50");
    expect(month).toContain("Valor previsto prévia R$ 75,00");
    // O saldo acumulado e o total ficam dentro do cartão do valor previsto; a seção "Meses
    // fechados" saiu do painel.
    expect(month).toContain(
      "Saldo acumulado de meses anteriores: R$ 0,00 Saldo total (previsto + acumulado): R$ 75,00",
    );
    await expect(ter.getByRole("heading", { name: /Meses fechados/ })).toHaveCount(0);
    const rows = section(ter, /Minhas indicações/).locator("tbody tr");
    await expect(rows).toHaveCount(2);
    expect(await rowText(ter, A.company)).toContain("30 R$ 1,50 R$ 45,00");
    expect(await rowText(ter, B.company)).toContain("20 R$ 1,50 R$ 30,00");
    // Total de vidas e de valor das indicações do mês.
    expect(
      clean(
        await section(ter, /Minhas indicações/)
          .locator("tfoot")
          .innerText(),
      ),
    ).toBe("Total 50 R$ 75,00");
    await expect(ter.getByText(/Prévia com a base do BI de/)).toBeVisible();
    await expect(ter.getByText(D.company)).toHaveCount(0);
    // Item 5: Minhas indicações também diz de quando é a base das vidas.
    await ter.goto("/indicacoes");
    await expect(ter.getByText(/base do BI de/)).toBeVisible();
  });

  await test.step("5.4 painel do contador mostra o prazo: 12 meses, ago/2026 a jul/2027", async () => {
    await con.goto("/inicio");
    await expect(
      con.getByText(
        /^Regra para quem você indicar em .*: R\$\s1,50 por vida · prazo de 12 meses\./,
      ),
    ).toBeVisible();
    expect(await rowText(con, E.company)).toContain(
      `12 meses: ${shortCompetencyLabel(AUG)} a ${shortCompetencyLabel(addMonths(AUG, 11))}`,
    );
  });

  await test.step("5.5 setembro de novo com A +8: vidas e carimbo mudam", async () => {
    await ter.goto(`/inicio?competency=${SEP}`);
    const note = ter.locator(".fp-panel-footnote").filter({ hasText: "Prévia com a base do BI" });
    const before = clean(await note.innerText());
    await expect(ter.locator(".fp-kpi-value").first()).toHaveText("55");
    while (minuteOf(Date.now()) <= minuteOf(septemberAt)) {
      await ter.waitForTimeout(2000);
    }
    await upload(bi, "Detalhamento Empresas - setembro (2).xlsx", SEP, SEPTEMBER_A8);
    await batchSummary(bi);
    await ter.reload();
    await expect(ter.locator(".fp-kpi-value").first()).toHaveText("63");
    expect(clean(await note.innerText())).not.toBe(before);
  });

  // Item 5 da reunião de 09/11/2026 (decisão 21): o parceiro vê os últimos envios, com o mês e se
  // o envio foi parcial ou do mês completo. Até aqui: agosto (2×) e setembro (2×), todos completos.
  await test.step("5.6 Teresina vê os últimos envios da planilha, com mês e parcial/completo", async () => {
    await ter.goto("/inicio");
    const rows = section(ter, "Últimos envios da planilha").locator("tbody tr");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText(SEP_LABEL);
    await expect(rows.first()).toContainText("mês completo");
    await expect(rows.nth(3)).toContainText(AUG_LABEL);
  });

  await test.step("6.1 outubro: preparar cálculo bloqueado, mês ainda não encerrado", async () => {
    await dir.goto(`/fechamento?competency=${OCT}`);
    await expect(dir.locator(".fp-steps")).toContainText(`${OCT_LABEL} ainda não terminou`);
    await expect(dir.getByRole("button", { name: "Preparar cálculo" })).toHaveCount(0);
  });

  await test.step("6.2 setembro com agosto aberto: feche agosto primeiro", async () => {
    // O mês do fechamento também troca na hora, pelo seletor.
    await dir.getByLabel("Mês do fechamento", { exact: true }).fill(SEP);
    await expect(dir).toHaveURL(new RegExp(`/fechamento\\?competency=${SEP}$`));
    await expect(dir.locator(".fp-steps")).toContainText(`Feche ${AUG_LABEL} primeiro`);
    await expect(dir.getByRole("button", { name: "Preparar cálculo" })).toHaveCount(0);
  });

  await test.step("6.3 agosto: importação depois de 31/08 e cálculo com saldo anterior 0", async () => {
    await dir.goto(`/fechamento?competency=${AUG}`);
    await expect(dir.locator(".fp-steps li").first()).toContainText(
      new RegExp(`Planilha de ${AUG_LABEL} enviada em .*, depois do fim do mês\\.`),
    );
    await dir.getByRole("button", { name: "Preparar cálculo" }).click();
    await expect(
      dir.getByRole("heading", { name: new RegExp(`${AUG_LABEL} · Em preparação`) }),
    ).toBeVisible();
    expect(await rowText(dir, /^Unidade Teresina/)).toMatch(
      /50 R\$ 1,50 R\$ 75,00 .*R\$ 0,00 R\$ 75,00$/,
    );
    expect(await rowText(dir, /^Unidade Natal/)).toMatch(
      /50 R\$ 2,00 R\$ 100,00 .*R\$ 0,00 R\$ 100,00$/,
    );
    // Itens 1 e 2 (decisão 22): a linha do parceiro mostra os vendedores do mês; sob ela, os
    // clientes com vidas, valor por vida, valor e vendedor; a soma é o valor do parceiro.
    expect(await rowText(dir, /^Unidade Teresina/)).toContain("teresina.e2e@fortespay.local");
    const teresinaClients = dir
      .locator("tr.fp-row-clients")
      .filter({ hasText: "Ver clientes de Unidade Teresina (2)" });
    await teresinaClients.locator("summary").click();
    expect(
      clean(await teresinaClients.getByRole("row", { name: new RegExp(A.company) }).innerText()),
    ).toContain("teresina.e2e@fortespay.local 30 R$ 1,50 R$ 45,00");
    expect(
      clean(await teresinaClients.getByRole("row", { name: new RegExp(B.company) }).innerText()),
    ).toContain("Bruno 20 R$ 1,50 R$ 30,00");
    // O detalhe tem o próprio total, para não confundir com o total do parceiro.
    expect(clean(await teresinaClients.locator("tfoot").innerText())).toBe(
      "Total dos clientes 50 R$ 75,00",
    );
    expect(await rowText(dir, /^Contador Fulano/)).toMatch(
      /10 R\$ 1,50 R\$ 15,00 .*R\$ 0,00 R\$ 15,00$/,
    );
  });

  await test.step("6.4 ajuste de −10,00 em Natal; recalcular mantém", async () => {
    const form = await openDisclosure(dir, "Ajustar o valor de um parceiro");
    const partner = form.getByLabel("Parceiro");
    const natal = await partner
      .locator("option", { hasText: "Unidade Natal" })
      .getAttribute("value");
    await partner.selectOption(natal ?? "");
    await form.getByLabel("Ajuste (R$)").fill("-10,00");
    await form.getByLabel("Motivo do ajuste").fill("Desconto combinado com a unidade.");
    await submitIn(form, "Salvar ajuste").click();
    await expect(dir.getByRole("status").filter({ hasText: "Ajuste salvo." })).toBeVisible();
    await expect(dir.getByRole("row", { name: /^Unidade Natal/ })).toContainText("R$ 90,00");
    await dir.getByRole("button", { name: "Recalcular" }).click();
    await expect(dir.getByRole("status").filter({ hasText: "Cálculo preparado." })).toBeVisible();
    await dir.reload();
    const row = await rowText(dir, /^Unidade Natal/);
    expect(row).toContain("-R$ 10,00 Desconto combinado com a unidade.");
    expect(row).toMatch(/R\$ 90,00$/);
  });

  await test.step("6.5 todos vêm marcados ao lado do nome; fechar sem confirmar é bloqueado; fecha pagando Teresina e Natal", async () => {
    // Os checkboxes de quem recebe ficam na tabela, ao lado do parceiro, e já vêm marcados; o do
    // cabeçalho marca e desmarca todos.
    const all = dir.getByRole("checkbox", { name: "Marcar ou desmarcar todos os parceiros" });
    const boxes = [/Unidade Teresina/, /Unidade Natal/, /Contador Fulano/].map((name) =>
      dir.getByRole("checkbox", { name }),
    );
    await expect(all).toBeChecked();
    for (const box of boxes) {
      await expect(box).toBeChecked();
    }
    await all.uncheck();
    for (const box of boxes) {
      await expect(box).not.toBeChecked();
    }
    await all.check();
    for (const box of boxes) {
      await expect(box).toBeChecked();
    }
    // O Contador acumula: desmarcado; o do cabeçalho deixa de estar marcado.
    await boxes[2].uncheck();
    await expect(all).not.toBeChecked();
    await dir.getByRole("button", { name: "Fechar lote" }).click();
    await expect(dir.getByRole("alert").filter({ hasText: "Confirme que conferiu" })).toBeVisible();
    await expect(boxes[2]).not.toBeChecked();
    await dir.getByLabel(/^Conferi a base/).check();
    await dir.getByRole("button", { name: "Fechar lote" }).click();
    await expect(
      dir.getByRole("heading", { name: new RegExp(`${AUG_LABEL} · Fechado`) }),
    ).toBeVisible();
  });

  await test.step("6.6 Teresina e Natal Pagar; Contador Acumular", async () => {
    expect(await rowText(dir, /^Unidade Teresina/)).toContain("Pagar");
    expect(await rowText(dir, /^Unidade Natal/)).toContain("Pagar");
    expect(await rowText(dir, /^Contador Fulano/)).toContain("Acumular");
  });

  await test.step("6.7 saldo pendente do Contador na linha e no total", async () => {
    await dir.goto("/inicio");
    await expect(
      dir.locator(".fp-kpi").filter({ hasText: "Saldo acumulado a pagar" }),
    ).toContainText("R$ 15,00");
    expect(await rowText(dir, "Contador Fulano")).toMatch(/R\$ 15,00$/);
    expect(clean(await dir.locator("tfoot").innerText())).toMatch(/R\$ 15,00$/);
  });

  await test.step("6.8 reenviar agosto: planilha de mês fechado é recusada, fechamento intacto", async () => {
    await dir.goto(`/fechamento?competency=${AUG}`);
    // O último rodapé da página é o total do fechamento (cada "Ver clientes" tem o seu).
    const before = clean(await dir.locator("tfoot").last().innerText());
    // Decisão 31: a recusa aparece já em "Conferir arquivo"; nada é gravado.
    await upload(bi, "Detalhamento Empresas - agosto.xlsx", AUG, AUGUST);
    await expect(
      bi.getByRole("alert").filter({
        hasText: `Mês já fechado (${AUG_NUMERIC}): a planilha não entra. Para corrigir, reabra o lote em Fechamento do mês.`,
      }),
    ).toBeVisible();
    await expect(bi.getByRole("region", { name: "Conferência do envio" })).toHaveCount(0);
    await bi.goto("/importacoes");
    await expect(bi.locator("a.fp-action-row")).toHaveCount(4);
    await dir.reload();
    expect(clean(await dir.locator("tfoot").last().innerText())).toBe(before);
  });

  await test.step("6.9 vigência do Contador em agosto: recusada; em outubro: aceita", async () => {
    await dir.goto(`/parceiros/${ids.contador}`);
    await expect(dir.locator("summary", { hasText: /^Editar a vigência/ })).toHaveCount(0);
    let form = await openDisclosure(dir, "Nova vigência");
    await form.getByLabel("Valor por vida (R$)").fill("1,70");
    await form.getByLabel("Vale a partir de").fill(AUG);
    await form.getByLabel("Prazo (meses)").fill("12");
    await submitIn(form, "Salvar nova vigência").click();
    await expect(
      dir.getByRole("alert").filter({ hasText: `Mês fechado (${AUG_NUMERIC})` }),
    ).toBeVisible();
    await dir.reload();
    form = await openDisclosure(dir, "Nova vigência");
    await form.getByLabel("Valor por vida (R$)").fill("1,60");
    await form.getByLabel("Vale a partir de").fill(OCT);
    await form.getByLabel("Prazo (meses)").fill("12");
    await submitIn(form, "Salvar nova vigência").click();
    await expect(dir.getByRole("status").filter({ hasText: "Regra salva." })).toBeVisible();
  });

  await test.step("6.10 Teresina confere agosto e confirma", async () => {
    // Item 5: o mês fechado também diz de quando é a base do BI (o reenvio de 6.8 foi recusado).
    await ter.goto(`/inicio?competency=${AUG}`);
    expect(clean(await section(ter, `${AUG_LABEL} · valor oficial`).innerText())).toMatch(
      /Base do BI de .*: último envio em .* \(mês completo\)\./,
    );
    await ter.goto("/fechamentos");
    const card = section(ter, AUG_LABEL);
    expect(clean(await card.innerText())).toContain(
      "Vidas pagas no mês 50 Valor do mês R$ 75,00 Saldo que vinha de antes R$ 0,00 Total R$ 75,00 Decisão da Fortes Pay Pagar",
    );
    await card.getByRole("button", { name: "Confirmar valor" }).click();
    await expect(
      ter
        .getByRole("status")
        .filter({ hasText: "Resposta registrada. A Fortes Pay já consegue ver." }),
    ).toBeVisible();
    await expect(
      section(ter, AUG_LABEL).getByText(/Você confirmou em \d{2}\/\d{2}\/\d{4}/),
    ).toBeVisible();
  });

  await test.step("6.11 Natal vê o ajuste e contesta; sem texto é bloqueado", async () => {
    await nat.goto("/fechamentos");
    const card = section(nat, AUG_LABEL);
    expect(clean(await card.innerText())).toContain(
      "Ajuste · Desconto combinado com a unidade. -R$ 10,00",
    );
    await card.getByRole("button", { name: "Contestar" }).click();
    await expect(
      nat.getByRole("alert").filter({ hasText: "Explique o que não confere" }),
    ).toBeVisible();
    await card.getByLabel(`O que não confere em ${AUG_LABEL}`).fill("Não combinei esse desconto.");
    await card.getByRole("button", { name: "Contestar" }).click();
    await expect(
      section(nat, AUG_LABEL).getByText(/Você contestou em .*: Não combinei esse desconto\./),
    ).toBeVisible();
  });

  await test.step("6.12 Contador vê Acumulado para o próximo mês", async () => {
    await con.goto("/fechamentos");
    const card = clean(await section(con, AUG_LABEL).innerText());
    expect(card).toContain("Acumulado para o próximo mês");
    expect(card).toContain("Total R$ 15,00");
    // No painel, o saldo que ficou de agosto aparece dentro do cartão do valor previsto de
    // setembro, somado a ele; o aviso para responder o fechamento continua lá.
    await con.goto(`/inicio?competency=${SEP}`);
    expect(clean(await section(con, `${SEP_LABEL} · prévia`).innerText())).toContain(
      `Saldo acumulado de ${AUG_LABEL}: R$ 15,00 Saldo total (previsto + acumulado): R$ 33,00`,
    );
    await expect(
      con.getByText(`Confira o valor de ${AUG_LABEL} e responda em Meus fechamentos.`),
    ).toBeVisible();
  });

  await test.step("6.13 resposta do parceiro: confirmou com data, contestou com texto, sem resposta", async () => {
    await dir.goto(`/fechamento?competency=${AUG}`);
    const response = (name: RegExp) => dir.getByRole("row", { name }).locator("td").nth(8);
    await expect(response(/^Unidade Teresina/)).toHaveText(
      /^Confirmado em \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/,
    );
    await expect(response(/^Unidade Natal/)).toHaveText(
      /^Contestado em .*: Não combinei esse desconto\.$/,
    );
    await expect(response(/^Contador Fulano/)).toHaveText("aguardando");
  });

  await test.step("7.1 setembro: Contador com o saldo de agosto somado", async () => {
    await dir.goto(`/fechamento?competency=${SEP}`);
    await dir.getByRole("button", { name: "Preparar cálculo" }).click();
    await expect(
      dir.getByRole("heading", { name: new RegExp(`${SEP_LABEL} · Em preparação`) }),
    ).toBeVisible();
    expect(await rowText(dir, /^Contador Fulano/)).toMatch(
      /12 R\$ 1,50 R\$ 18,00 .*R\$ 15,00 R\$ 33,00$/,
    );
    expect(await rowText(dir, /^Unidade Teresina/)).toMatch(/R\$ 0,00 R\$ 94,50$/);
    expect(await rowText(dir, /^Unidade Natal/)).toMatch(/R\$ 0,00 R\$ 110,00$/);
  });

  await test.step("7.1b revisão da IA do cálculo de setembro", async () => {
    await resetFakeRequests();
    await dir.getByRole("button", { name: "Analisar com IA" }).click();
    await expect(dir.getByText(FAKE_CLOSING_SUMMARY)).toBeVisible({ timeout: 30000 });
    const requests = await fakeRequests();
    expect(requests).toHaveLength(1);
    const material = JSON.parse(
      String((requests[0].body.messages as { content: string }[])[0].content),
    );
    expect(material.mes).toBe(SEP_LABEL);
    expect(material.parceiros.map((partner: { parceiro: string }) => partner.parceiro)).toEqual([
      "Contador Fulano",
      "Unidade Natal",
      "Unidade Teresina",
    ]);
  });

  await test.step("7.2 os três pagos (já vêm marcados); saldo pendente zera", async () => {
    for (const name of [/Unidade Teresina/, /Unidade Natal/, /Contador Fulano/]) {
      await expect(dir.getByRole("checkbox", { name })).toBeChecked();
    }
    await dir.getByLabel(/^Conferi a base/).check();
    await dir.getByRole("button", { name: "Fechar lote" }).click();
    await expect(
      dir.getByRole("heading", { name: new RegExp(`${SEP_LABEL} · Fechado`) }),
    ).toBeVisible();
    expect(await rowText(dir, /^Contador Fulano/)).toContain("R$ 33,00 Pagar");
    await dir.goto("/inicio");
    await expect(
      dir.locator(".fp-kpi").filter({ hasText: "Saldo acumulado a pagar" }),
    ).toContainText("R$ 0,00");
  });

  // Bloco 17 — decisão 30 de 22/11/2026: reabrir o último mês fechado para corrigir erro. Roda
  // aqui, com agosto e setembro fechados, e deixa setembro fechado de novo como estava.
  await test.step("17.1 agosto não reabre com setembro fechado; reabrir exige a confirmação", async () => {
    await dir.goto(`/fechamento?competency=${AUG}`);
    const august = section(dir, `Reabrir o lote de ${AUG_LABEL}`);
    await expect(august).toContainText("Só o último mês fechado pode ser reaberto.");
    await expect(august.getByRole("button", { name: "Reabrir lote" })).toHaveCount(0);
    await august.getByRole("link", { name: SEP_LABEL }).click();
    await expect(dir).toHaveURL(new RegExp(`/fechamento\\?competency=${SEP}$`));
    const september = section(dir, `Reabrir o lote de ${SEP_LABEL}`);
    await september.getByRole("button", { name: "Reabrir lote" }).click();
    await expect(
      dir.getByRole("alert").filter({ hasText: "Confirme que entendeu o que será apagado" }),
    ).toBeVisible();
    await expect(
      dir.getByRole("heading", { name: new RegExp(`${SEP_LABEL} · Fechado`) }),
    ).toBeVisible();
  });

  await test.step("17.2 setembro reaberto: volta à preparação com os valores; some do parceiro", async () => {
    await ter.goto("/fechamentos");
    await expect(section(ter, SEP_LABEL)).toHaveCount(1);
    const card = section(dir, `Reabrir o lote de ${SEP_LABEL}`);
    await card.getByLabel(/^Entendi o que será apagado/).check();
    await card.getByRole("button", { name: "Reabrir lote" }).click();
    await expect(dir.getByRole("status").filter({ hasText: "Lote reaberto." })).toBeVisible();
    await expect(
      dir.getByRole("heading", { name: new RegExp(`${SEP_LABEL} · Em preparação`) }),
    ).toBeVisible();
    // Valores e saldo anterior continuam; a decisão sumiu e todos voltam marcados para pagamento.
    expect(await rowText(dir, /^Contador Fulano/)).toMatch(
      /12 R\$ 1,50 R\$ 18,00 .*R\$ 15,00 R\$ 33,00$/,
    );
    await expect(dir.getByRole("checkbox", { name: /Contador Fulano/ })).toBeChecked();
    await expect(section(dir, /^Reabrir o lote de /)).toHaveCount(0);
    // Para o parceiro, setembro deixa de ser valor oficial até fechar de novo.
    await ter.reload();
    await expect(section(ter, SEP_LABEL)).toHaveCount(0);
    await expect(section(ter, AUG_LABEL)).toHaveCount(1);
    await ter.goto(`/inicio?competency=${SEP}`);
    await expect(ter.getByRole("heading", { name: `${SEP_LABEL} · prévia` })).toBeVisible();
  });

  await test.step("17.3 mês reaberto aceita a planilha de novo; recalcula e fecha outra vez", async () => {
    await upload(bi, "Detalhamento Empresas - setembro (3).xlsx", SEP, SEPTEMBER_A8);
    expect((await batchSummary(bi)).imported).toBe(4);
    await dir.goto(`/fechamento?competency=${SEP}`);
    await dir.getByRole("button", { name: "Recalcular" }).click();
    await expect(dir.getByRole("status").filter({ hasText: "Cálculo preparado." })).toBeVisible();
    await dir.reload();
    await dir.getByLabel(/^Conferi a base/).check();
    await dir.getByRole("button", { name: "Fechar lote" }).click();
    await expect(
      dir.getByRole("heading", { name: new RegExp(`${SEP_LABEL} · Fechado`) }),
    ).toBeVisible();
    expect(await rowText(dir, /^Contador Fulano/)).toContain("R$ 33,00 Pagar");
    await ter.goto(`/inicio?competency=${SEP}`);
    await expect(ter.getByRole("heading", { name: `${SEP_LABEL} · valor oficial` })).toBeVisible();
  });

  await test.step("7.3 fechamentos com preparo, fechamento e quem fechou; linhas com data e quem decidiu", async () => {
    await dir.goto(`/fechamento?competency=${AUG}`);
    const history = section(dir, "Fechamentos registrados").locator("tbody tr");
    await expect(history).toHaveCount(2);
    for (const month of [AUG_LABEL, SEP_LABEL]) {
      expect(clean(await history.filter({ hasText: month }).innerText())).toMatch(
        /Fechado \d{2}\/\d{2}\/\d{4} \d{2}\/\d{2}\/\d{4} Diretor Roteiro$/,
      );
    }
    const teresina = dir.getByRole("row", { name: /^Unidade Teresina/ }).locator("td");
    await expect(teresina.nth(3)).toHaveText("R$ 75,00");
    await expect(teresina.nth(7)).toContainText("Pagar");
    await expect(teresina.nth(7)).toContainText(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
    await expect(teresina.nth(7)).toContainText("Diretor Roteiro");
  });

  await test.step("7.4 Teresina em outubro: A a 1,80; setembro continua 1,50", async () => {
    await ter.goto(`/inicio?competency=${OCT}`);
    await expect(
      ter.getByText(/^Regra para quem você indicar em .*: R\$\s1,80 por vida · sem prazo\./),
    ).toBeVisible();
    expect(await rowText(ter, A.company)).toContain("0 R$ 1,80 R$ 0,00");
    await ter.goto(`/inicio?competency=${SEP}`);
    await expect(ter.getByRole("heading", { name: `${SEP_LABEL} · valor oficial` })).toBeVisible();
    expect(await rowText(ter, A.company)).toContain("R$ 1,50");
  });

  await test.step("8.1 export parcial de outubro sem B", async () => {
    await upload(bi, "Detalhamento Empresas - outubro.xlsx", OCT, OCTOBER);
    expect(await batchSummary(bi)).toEqual({ read: 13, imported: 3, skipped: 8, ignored: 2 });
    await expect(bi.locator(".fp-facts")).toContainText(`${OCT_LABEL} (parcial)`);
  });

  await test.step("8.2 arquivo parcial não marca inadimplência: A, B, D, E Ativa", async () => {
    await dir.goto("/indicacoes");
    for (const entry of [A, B, D, E]) {
      expect(await rowText(dir, entry.company)).toContain("Ativa");
    }
  });

  await test.step("8.3 painel de Teresina: B com 0 vidas até agora; A × 1,80", async () => {
    await ter.goto("/inicio");
    expect(await rowText(ter, B.company)).toContain("Rendendo 0 R$ 1,80 R$ 0,00");
    expect(await rowText(ter, A.company)).toContain("37 R$ 1,80 R$ 66,60");
    await expect(ter.locator(".fp-kpi-preview")).toContainText("R$ 66,60");
  });

  await test.step("8.4 novo envio parcial (CSV) substitui o mês: A passa a 40 vidas", async () => {
    await upload(bi, "Planilha sem título - Export.csv", OCT, OCTOBER_UPDATE);
    expect(await batchSummary(bi)).toEqual({ read: 13, imported: 3, skipped: 8, ignored: 2 });
    await ter.goto("/inicio");
    expect(await rowText(ter, A.company)).toContain("40 R$ 1,80 R$ 72,00");
    await expect(ter.locator(".fp-kpi-preview")).toContainText("R$ 72,00");
    // Item 5: o envio do mês em andamento aparece como parcial na lista de últimos envios.
    const latest = section(ter, "Últimos envios da planilha").locator("tbody tr").first();
    await expect(latest).toContainText(OCT_LABEL);
    await expect(latest).toContainText("parcial");
  });

  await test.step("8.5 D cancelada: não conta em outubro; agosto e setembro intactos", async () => {
    await changeStatus(dir, D, "cancelled", "Cancelada");
    await nat.goto("/inicio");
    const october = section(nat, `${OCT_LABEL} · prévia`);
    // Regra D-1: as vidas valem até ontem (Fortaleza); no dia 1 o mês ainda não tem dia fechado.
    const today = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Fortaleza", day: "numeric" }).format(
        new Date(),
      ),
    );
    await expect(october.locator(".fp-kpi-heading span").first()).toHaveText(
      today > 1 ? `até o dia ${today - 1}` : "ainda sem dia fechado",
    );
    await expect(october.locator(".fp-kpi-value").first()).toHaveText("0");
    await expect(nat.getByRole("row", { name: new RegExp(D.company) })).toHaveCount(0);
    await nat.goto(`/inicio?competency=${AUG}`);
    const august = clean(await section(nat, `${AUG_LABEL} · valor oficial`).innerText());
    expect(august).toContain("50 vidas pagas");
    expect(august).toContain("Total do fechamento Pagar R$ 90,00");
    await nat.goto(`/inicio?competency=${SEP}`);
    expect(clean(await section(nat, `${SEP_LABEL} · valor oficial`).innerText())).toContain(
      "55 vidas pagas",
    );
    await nat.goto("/fechamentos");
    expect(clean(await section(nat, AUG_LABEL).innerText())).toContain("Total R$ 90,00");
    expect(clean(await section(nat, SEP_LABEL).innerText())).toContain("Total R$ 110,00");
  });

  await test.step("8.6 indicações por situação", async () => {
    await dir.goto("/inicio");
    const strip = clean(await dir.locator(".fp-stage-groups").innerText());
    for (const expected of ["Ativa 3", "Inadimplente 0", "Cancelada 1", "Perdida 1"]) {
      expect(strip).toContain(expected);
    }
  });

  // Item 4 da reunião de 09/11/2026: a lista do diretor escolhe o mês das vidas.
  await test.step("8.8 lista do diretor por mês: vidas de A em agosto e em setembro", async () => {
    for (const [month, lives] of [
      [AUG, "30"],
      [SEP, "41"],
    ] as const) {
      await dir.goto(`/indicacoes?competency=${month}`);
      await expect(dir.getByLabel("Mês", { exact: true })).toHaveValue(month);
      await expect(
        section(dir, "Lista").getByRole("columnheader", {
          name: `Vidas em ${shortCompetencyLabel(month)}`,
        }),
      ).toBeVisible();
      await expect(
        section(dir, "Lista")
          .getByRole("row", { name: new RegExp(A.company) })
          .locator("td")
          .nth(5),
      ).toHaveText(lives);
    }
  });

  await test.step("9.1 Teresina não abre nada alheio pela URL nem pela API", async () => {
    for (const path of [`/parceiros/${ids.natal}`, "/fechamento", "/importacoes"]) {
      await ter.goto(path);
      await expect(ter).toHaveURL(/\/inicio$/);
      await expect(ter.locator("main")).not.toContainText(
        /Unidade Natal|Empresa D|Contador Fulano/,
      );
    }
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(
      (
        await client.auth.signInWithPassword({
          email: "teresina.e2e@fortespay.local",
          password: PASSWORD,
        })
      ).error,
    ).toBeNull();
    const calls = await Promise.all([
      client.rpc("prepare_closing", { month: `${OCT}-01` }),
      client.rpc("save_partner_rule", {
        payload: {
          partner_id: ids.teresina,
          value_per_life: "9.99",
          valid_from: `${NOV}-01`,
          term_months: "",
        },
      }),
      client.rpc("save_partner_rule", {
        payload: {
          partner_id: ids.teresina,
          referral_id: ids.teresina,
          value_per_life: "9.99",
          valid_from: `${NOV}-01`,
          term_months: "",
        },
      }),
      client.rpc("set_payment_note", { target: ids.teresina, note: "x" }),
    ]);
    for (const call of calls) {
      expect(call.error?.code).toBe("42501");
    }
    const rules = (await client.from("partner_rules").select("partner_id")).data ?? [];
    expect(rules.every((rule) => rule.partner_id === ids.teresina)).toBe(true);
    expect((await client.from("import_batches").select("id")).data).toEqual([]);
  });

  await test.step("9.2 parceiro pendente continua em Cadastro em análise", async () => {
    await register(pen, {
      name: "Unidade Pendente",
      contact: "Ana Pendente",
      city: "Sobral",
      state: "CE",
      phone: "(88) 95555-0000",
      email: "pendente.e2e@fortespay.local",
    });
    await pen.goto("/inicio");
    await expect(pen).toHaveURL(/\/cadastro-em-analise$/);
  });

  await test.step("9.3 o navegador não recebe service_role", async () => {
    for (const page of [dir, ter, bi, anon]) {
      const sources = await page.evaluate(() =>
        Array.from(document.scripts)
          .map((script) => script.src)
          .filter(Boolean),
      );
      const bodies = [
        await page.content(),
        ...(await Promise.all(sources.map(async (src) => (await request.get(src)).text()))),
      ];
      for (const body of bodies) {
        expect(body).not.toContain("service_role");
        expect(body).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "chave-ausente");
      }
    }
  });

  // Bloco 10 — decisões de 28/10/2026: configuração da indicação e "como foi pago".
  await test.step("10.1 diretor define valor e prazo próprios para A", async () => {
    await dir.goto("/indicacoes");
    await dir.getByRole("link", { name: A.company }).click();
    await expect(dir).toHaveURL(/\/indicacoes\/[0-9a-f-]{36}$/);
    expect(clean(await dir.locator(".fp-facts").innerText())).toContain(
      `1º mês pago ${shortCompetencyLabel(AUG)}`,
    );
    await expect(dir.locator(".fp-notice").filter({ hasText: /Rende desde / })).toBeVisible();
    // Decisão 23: valor e prazo próprios são uma vigência da indicação, a partir de um mês.
    const form = await openDisclosure(dir, "Nova vigência");
    await form.getByLabel("Valor por vida (R$)").fill("2,50");
    await form.getByLabel("Prazo (meses)").fill("3");
    await submitIn(form, "Salvar nova vigência").click();
    await expect(
      dir.getByRole("status").filter({ hasText: "Vigência da indicação salva." }),
    ).toBeVisible();
    await dir.goto("/indicacoes");
    expect(await rowText(dir, A.company)).toContain("R$ 2,50 por vida · 3 meses");
  });

  await test.step("10.2 outubro recalcula A com 2,50; agosto fechado não muda", async () => {
    await dir.goto(`/inicio?competency=${OCT}`);
    expect(await rowText(dir, "Unidade Teresina")).toContain("40 R$ 1,80 R$ 100,00");
    await dir.goto(`/fechamento?competency=${AUG}`);
    await expect(
      dir
        .getByRole("row", { name: /^Unidade Teresina/ })
        .locator("td")
        .nth(6),
    ).toHaveText("R$ 75,00");
    // Item 2: o detalhe por cliente do mês fechado é o retrato do fechamento, não um recálculo.
    const clients = dir
      .locator("tr.fp-row-clients")
      .filter({ hasText: "Ver clientes de Unidade Teresina (2)" });
    await clients.locator("summary").click();
    expect(
      clean(await clients.getByRole("row", { name: new RegExp(A.company) }).innerText()),
    ).toContain("30 R$ 1,50 R$ 45,00");
  });

  await test.step("10.3 Teresina vê o valor e o prazo próprios de A", async () => {
    await ter.goto("/inicio");
    expect(await rowText(ter, A.company)).toContain(
      `40 R$ 2,50 R$ 100,00 3 meses: ${shortCompetencyLabel(AUG)} a ${shortCompetencyLabel(addMonths(AUG, 2))}`,
    );
  });

  await test.step("10.4 sem vigência própria, A volta à regra do parceiro", async () => {
    await dir.goto("/indicacoes");
    await dir.getByRole("link", { name: A.company }).click();
    await expect(dir).toHaveURL(/\/indicacoes\/[0-9a-f-]{36}$/);
    await expect(dir.getByRole("heading", { name: "Valor e prazo desta indicação" })).toBeVisible();
    const edit = await openDisclosure(dir, /^Editar a vigência de /);
    await submitIn(edit, "Remover esta vigência").click();
    await expect(dir.getByRole("status").filter({ hasText: "Vigência removida." })).toBeVisible();
    await ter.goto("/inicio");
    expect(await rowText(ter, A.company)).toContain("40 R$ 1,80 R$ 72,00 sem prazo");
  });

  await test.step("10.5 diretor anota como pagou; Teresina vê", async () => {
    await dir.goto(`/fechamento?competency=${AUG}`);
    const field = dir.getByLabel(/^Como foi pago a Unidade Teresina/);
    await field.fill("PIX em 05/09/2026");
    await dir
      .locator("form")
      .filter({ has: field })
      .getByRole("button", { name: "Salvar" })
      .click();
    await expect(
      dir.getByRole("status").filter({ hasText: "Forma de pagamento salva." }),
    ).toBeVisible();
    await expect(dir.getByLabel(/^Como foi pago a Contador Fulano/)).toHaveCount(0);
    await dir.reload();
    await expect(dir.getByLabel(/^Como foi pago a Unidade Teresina/)).toHaveValue(
      "PIX em 05/09/2026",
    );
    await ter.goto("/fechamentos");
    expect(clean(await section(ter, AUG_LABEL).innerText())).toContain(
      "Como foi pago PIX em 05/09/2026",
    );
  });

  await test.step("10.6 indicação registrada pelo diretor já com valor e prazo", async () => {
    await dir.goto("/indicacoes");
    const form = await openDisclosure(dir, "Registrar indicação em nome de um parceiro");
    await form.locator("select[name=partner_id]").selectOption({ label: "Unidade Natal" });
    await form.getByLabel("CNPJ do cliente").fill(F.cnpj);
    await form.getByLabel("Empresa", { exact: true }).fill(F.company);
    await form.getByLabel("Valor por vida desta indicação (R$)").fill("3,00");
    await form.getByLabel("Prazo desta indicação (meses)").fill("6");
    await submitIn(form, "Registrar indicação").click();
    await expect(
      dir.getByRole("status").filter({ hasText: "Indicação registrada." }),
    ).toBeVisible();
    const row = await rowText(dir, F.company);
    expect(row).toContain("Unidade Natal");
    expect(row).toContain("R$ 3,00 por vida · 6 meses");
  });

  // Bloco 15 — decisão 27 de 16/11/2026: o diretor escolhe a vigência do parceiro de uma empresa
  // nova, na tela do envio da planilha. Teresina tem 1,50 desde agosto e 1,80 desde outubro.
  const companies = () => section(dir, /^Empresas com vidas em /);

  await test.step("15.1 empresa nova no envio de outubro: vigência automática de outubro; quem já fechou mês não troca", async () => {
    await refer(ter, G, "15");
    await expect(
      ter.getByRole("status").filter({ hasText: "Indicação registrada." }),
    ).toBeVisible();
    await upload(bi, "outubro-com-g.xlsx", OCT, OCTOBER_WITH_G);
    await dir.goto(bi.url());
    await expect(
      dir.getByRole("heading", { name: new RegExp(`^Empresas com vidas em ${OCT_LABEL} \\(`) }),
    ).toBeVisible();
    const rowG = clean(
      await companies()
        .getByRole("row", { name: new RegExp(G.company) })
        .innerText(),
    );
    expect(rowG).toContain("nova: 1º mês pago");
    expect(rowG).toContain("Unidade Teresina");
    expect(rowG).toContain("R$ 1,80 por vida · sem prazo");
    expect(rowG).toContain(
      `vigência de ${shortCompetencyLabel(OCT)}: R$ 1,80 por vida · sem prazo (automática)`,
    );
    expect(rowG).toContain("R$ 27,00");
    // A já teve vidas em agosto e setembro, fechados: a vigência dela não muda por aqui.
    const rowA = companies().getByRole("row", { name: new RegExp(A.company) });
    await expect(rowA).toContainText("já teve vidas em mês fechado");
    await expect(rowA.getByRole("button", { name: "Aplicar" })).toHaveCount(0);
    // Só G pode trocar de vigência: as outras empresas do mês já tiveram vidas em mês fechado.
    await expect(companies().getByRole("button", { name: "Aplicar" })).toHaveCount(1);
  });

  await test.step("15.2 diretor aplica a vigência de agosto a G na tela do envio: 1,50 na hora", async () => {
    const row = companies().getByRole("row", { name: new RegExp(G.company) });
    const choice = row.getByLabel(`Vigência do parceiro para ${G.company}`);
    expect(clean((await choice.locator("option").allInnerTexts()).join(" | "))).toBe(
      [
        `Automática (${shortCompetencyLabel(OCT)} · R$ 1,80 · sem prazo)`,
        `Vigência de ${shortCompetencyLabel(AUG)} · R$ 1,50 · sem prazo`,
        `Vigência de ${shortCompetencyLabel(OCT)} · R$ 1,80 · sem prazo`,
      ].join(" | "),
    );
    await choice.selectOption(AUG);
    await row.getByRole("button", { name: "Aplicar" }).click();
    await expect(
      dir.getByRole("status").filter({ hasText: "Regra da indicação atualizada." }),
    ).toBeVisible();
    await expect(dir).toHaveURL(/\/importacoes\/[0-9a-f-]{36}$/);
    const rowG = clean(
      await companies()
        .getByRole("row", { name: new RegExp(G.company) })
        .innerText(),
    );
    expect(rowG).toContain("R$ 1,50 por vida · sem prazo");
    expect(rowG).toContain(
      `vigência de ${shortCompetencyLabel(AUG)}: R$ 1,50 por vida · sem prazo (escolhida pelo diretor)`,
    );
    expect(rowG).toContain("R$ 22,50");
    await expect(
      companies()
        .getByRole("row", { name: new RegExp(G.company) })
        .getByLabel(`Vigência do parceiro para ${G.company}`),
    ).toHaveValue(AUG);
  });

  await test.step("15.3 Teresina vê G a 1,50 no painel", async () => {
    await ter.goto("/inicio");
    expect(await rowText(ter, G.company)).toContain("15 R$ 1,50 R$ 22,50 sem prazo");
  });

  await test.step("15.4 na ficha da indicação a escolha aparece e volta para a automática", async () => {
    await dir.goto("/indicacoes");
    await dir.getByRole("link", { name: G.company }).click();
    await expect(dir).toHaveURL(/\/indicacoes\/[0-9a-f-]{36}$/);
    const card = section(dir, "Vigência do parceiro aplicada");
    expect(clean(await card.innerText())).toContain(
      `Hoje: vigência de ${shortCompetencyLabel(AUG)}: R$ 1,50 por vida · sem prazo (escolhida pelo diretor)`,
    );
    await card.getByLabel(`Vigência do parceiro para ${G.company}`).selectOption("");
    await card.getByRole("button", { name: "Aplicar" }).click();
    await expect(
      dir.getByRole("status").filter({ hasText: "Regra da indicação atualizada." }),
    ).toBeVisible();
    expect(clean(await section(dir, "Vigência do parceiro aplicada").innerText())).toContain(
      `Hoje: vigência de ${shortCompetencyLabel(OCT)}: R$ 1,80 por vida · sem prazo (automática)`,
    );
    await ter.goto("/inicio");
    expect(await rowText(ter, G.company)).toContain("15 R$ 1,80 R$ 27,00 sem prazo");
    // A, com vidas em mês fechado, não oferece a escolha na ficha.
    await dir.goto("/indicacoes");
    await dir.getByRole("link", { name: A.company }).click();
    const locked = section(dir, "Vigência do parceiro aplicada");
    await expect(locked).toContainText("já teve vidas num mês fechado");
    await expect(locked.getByRole("button", { name: "Aplicar" })).toHaveCount(0);
  });

  // Bloco 16 — decisão 29 de 22/11/2026: conta de vendedor. Ele pede a conta com o e-mail da
  // unidade, o diretor aprova, e ele só registra e acompanha as próprias indicações, sem valores.
  const moneyWords = /R\$|por vida|prazo|comiss/i;

  await test.step("16.1 vendedor pede a conta: e-mail de unidade errado é recusado; o certo fica em análise", async () => {
    await ven.goto("/login");
    await ven.getByRole("link", { name: "Solicitar criação de conta" }).click();
    await ven.getByRole("link", { name: "Solicitar conta de vendedor" }).click();
    await expect(ven).toHaveURL(/\/cadastro\/vendedor$/);
    await expect(
      ven.getByRole("heading", { level: 1, name: "Solicitar conta de vendedor" }),
    ).toBeVisible();
    await ven.getByLabel("Seu nome").fill("Carla Vendedora");
    await ven.getByLabel("E-mail da unidade").fill("unidade.errada.e2e@fortespay.local");
    await ven.getByLabel("E-mail de acesso").fill(SELLER_EMAIL);
    await ven.getByLabel("Senha (mínimo de 8 caracteres)").fill(PASSWORD);
    await ven.getByLabel("Confirmar senha").fill(PASSWORD);
    await ven.getByRole("button", { name: "Enviar solicitação" }).click();
    await expect(
      ven
        .getByRole("alert")
        .filter({ hasText: "Não encontramos uma unidade ativa com este e-mail." }),
    ).toBeVisible();
    // A conta de acesso já existe; falta só acertar a unidade (com maiúsculas, tanto faz).
    await expect(ven.getByText(`Conta: ${SELLER_EMAIL}`)).toBeVisible();
    await ven.getByLabel("Seu nome").fill("Carla Vendedora");
    await ven.getByLabel("E-mail da unidade").fill("Teresina.E2E@fortespay.local");
    await ven.getByRole("button", { name: "Enviar solicitação" }).click();
    await expect(ven).toHaveURL(/\/cadastro-em-analise$/);
    await expect(
      ven.getByRole("heading", { level: 1, name: "Solicitação em análise" }),
    ).toBeVisible();
    await expect(ven.getByText("Unidade: Unidade Teresina")).toBeVisible();
    for (const path of ["/indicacoes", "/inicio"]) {
      await ven.goto(path);
      await expect(ven).toHaveURL(/\/cadastro-em-analise$/);
    }
  });

  await test.step("16.2 diretor é avisado, vê o pedido em Parceiros e na ficha da unidade, e aprova", async () => {
    await dir.goto("/inicio");
    await expect(dir.getByText("1 vendedor aguardando aprovação")).toBeVisible();
    await dir.getByRole("link", { name: "Analisar vendedores em Parceiros" }).click();
    await expect(dir).toHaveURL(/\/parceiros$/);
    const pendingRow = section(dir, "Vendedores pedindo acesso (1)").getByRole("row", {
      name: /Carla Vendedora/,
    });
    await expect(pendingRow).toContainText(SELLER_EMAIL);
    await expect(pendingRow).toContainText("Unidade Teresina");
    // A ficha da unidade continua abrindo com o vendedor ligado a ela.
    await pendingRow.getByRole("link", { name: "Unidade Teresina" }).click();
    await expect(dir).toHaveURL(new RegExp(`/parceiros/${ids.teresina}$`));
    await expect(
      section(dir, "Vendedores (1)").getByRole("row", { name: /Carla Vendedora/ }),
    ).toContainText("Aguardando aprovação");
    await expect(section(dir, "Acesso ao sistema")).toContainText("teresina.e2e@fortespay.local");
    await dir.goto("/parceiros");
    await section(dir, "Vendedores pedindo acesso (1)")
      .getByRole("button", { name: "Aprovar vendedor" })
      .click();
    await expect(
      dir
        .getByRole("status")
        .filter({ hasText: "Vendedor aprovado. O acesso dele está liberado." }),
    ).toBeVisible();
    await expect(section(dir, /^Vendedores pedindo acesso/)).toHaveCount(0);
  });

  await test.step("16.3 vendedor entra só em Minhas indicações, sem valores e sem as outras telas", async () => {
    await ven.reload();
    await expect(ven).toHaveURL(/\/indicacoes$/);
    await expect(ven.getByRole("heading", { level: 1, name: "Minhas indicações" })).toBeVisible();
    expect(await navLabels(ven)).toEqual(["Minhas indicações"]);
    await expect(ven.locator("main")).not.toContainText(moneyWords);
    for (const path of [
      "/inicio",
      "/fechamentos",
      "/meu-cadastro",
      "/parceiros",
      `/parceiros/${ids.teresina}`,
      "/fechamento",
      "/importacoes",
      "/equipe",
    ]) {
      await ven.goto(path);
      await expect(ven).toHaveURL(/\/indicacoes$/);
    }
  });

  await test.step("16.4 vendedor indica H; CNPJ já indicado mostra só a data", async () => {
    await refer(ven, H, "9");
    await expect(
      ven.getByRole("status").filter({ hasText: "Indicação registrada." }),
    ).toBeVisible();
    await expect(ven.getByRole("heading", { name: "Em andamento (1)" })).toBeVisible();
    expect(await rowText(ven, H.company)).toContain("Indicada");
    await refer(ven, A);
    await expect(ven.getByRole("alert").filter({ hasText: "CNPJ já indicado em" })).toHaveText(
      /^CNPJ já indicado em \d{2}\/\d{2}\/\d{4}\.$/,
    );
  });

  await test.step("16.5 unidade e diretor veem H com o e-mail do vendedor", async () => {
    await ter.goto("/indicacoes");
    expect(await rowText(ter, H.company)).toContain(`Vendedor: ${SELLER_EMAIL}`);
    await dir.goto("/indicacoes");
    const row = await rowText(dir, H.company);
    expect(row).toContain("Unidade Teresina");
    expect(row).toContain(`Vendedor: ${SELLER_EMAIL}`);
  });

  await test.step("16.6 com a planilha, o vendedor vê as vidas pagas de H e nenhum valor", async () => {
    await upload(bi, "outubro-com-h.xlsx", OCT, OCTOBER_WITH_H);
    await batchSummary(bi);
    await ven.goto("/indicacoes");
    await expect(ven.getByRole("heading", { name: "Clientes pagando (1)" })).toBeVisible();
    await expect(ven.getByRole("columnheader", { name: `Vidas em ${OCT_LABEL}` })).toBeVisible();
    const row = await rowText(ven, H.company);
    expect(row).toContain("Cliente pagando");
    expect(row).toMatch(/ 9 \d{2}\/\d{2}\/\d{4}$/);
    // Só as indicações dele: A, B e G são da unidade e não aparecem.
    await expect(ven.locator("main tbody tr")).toHaveCount(1);
    await expect(ven.locator("main")).not.toContainText(moneyWords);
  });

  await test.step("16.7 pela API o vendedor não lê tabela nenhuma: só a lista dele, sem valores", async () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    expect(
      (await client.auth.signInWithPassword({ email: SELLER_EMAIL, password: PASSWORD })).error,
    ).toBeNull();
    for (const table of [
      "partners",
      "partner_rules",
      "referrals",
      "monthly_lives",
      "closing_items",
      "import_batches",
      "referral_month_lives",
      "partner_month_amounts",
    ]) {
      expect((await client.from(table).select("*")).data, table).toEqual([]);
    }
    const own = (await client.rpc("seller_referrals")).data ?? [];
    expect(own).toHaveLength(1);
    expect(Object.keys(own[0]).sort()).toEqual([
      "activated_competency",
      "cnpj",
      "company_name",
      "competency",
      "created_at",
      "id",
      "lives",
      "status",
      "status_changed_at",
    ]);
    const denied = await client.rpc("prepare_closing", { month: `${OCT}-01` });
    expect(denied.error?.code).toBe("42501");
  });

  await test.step("16.8 diretor gera link de nova senha e remove o acesso; a indicação fica com a unidade", async () => {
    await dir.goto(`/parceiros/${ids.teresina}`);
    const row = section(dir, "Vendedores (1)").getByRole("row", { name: /Carla Vendedora/ });
    await expect(row).toContainText("Com acesso");
    await row.getByRole("button", { name: "Gerar link", exact: true }).click();
    expect(await row.getByLabel("Link de nova senha").inputValue()).toMatch(
      /\/nova-senha\/[A-Za-z0-9_-]{43}$/,
    );
    await row.getByRole("button", { name: "Remover acesso" }).click();
    await expect(dir.getByRole("status").filter({ hasText: "Vendedor sem acesso." })).toBeVisible();
    await expect(
      section(dir, "Vendedores (1)").getByRole("row", { name: /Carla Vendedora/ }),
    ).toContainText("Sem acesso");
    await ven.goto("/indicacoes");
    await expect(ven).toHaveURL(/\/cadastro-em-analise$/);
    await expect(ven.getByRole("heading", { level: 1, name: "Acesso não liberado" })).toBeVisible();
    await ter.goto("/indicacoes");
    expect(await rowText(ter, H.company)).toContain(`Vendedor: ${SELLER_EMAIL}`);
  });

  // Bloco 12 (continuação) — decisão 19 de 09/11/2026 (Minha conta e Equipe) e decisão 26 de
  // 16/11/2026 ("Esqueci minha senha" por e-mail).
  await test.step("12.4 Minha conta: diretor troca a própria senha; a nova entra, a antiga não", async () => {
    await dir.goto("/inicio");
    await dir.getByRole("link", { name: "Minha conta" }).first().click();
    await expect(dir).toHaveURL(/\/minha-conta$/);
    await expect(dir.getByRole("heading", { level: 1, name: "Minha conta" })).toBeVisible();
    await dir.getByLabel("Senha atual").fill(PASSWORD);
    await dir.getByLabel("Nova senha (mínimo de 8 caracteres)").fill(NEW_PASSWORD);
    await dir.getByLabel("Confirme a nova senha").fill(NEW_PASSWORD);
    await dir.getByRole("button", { name: "Alterar senha" }).click();
    await expect(dir.getByRole("status").filter({ hasText: "Senha alterada." })).toBeVisible();
    const fresh = await actor(browser, base);
    await login(fresh, staff.director.email, NEW_PASSWORD);
    await expect(fresh).toHaveURL(/\/inicio$/);
    const old = await actor(browser, base);
    await old.goto("/login");
    await old.getByLabel("E-mail", { exact: true }).fill(staff.director.email);
    await old.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await old.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      old.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." }),
    ).toBeVisible();
  });

  await test.step("12.5 Equipe: diretor convida outro diretor, que entra direto; parceiro não vê Equipe", async () => {
    await dir.goto("/equipe");
    await expect(dir.getByRole("heading", { level: 1, name: "Equipe" })).toBeVisible();
    const directors = section(dir, "Diretores");
    await expect(directors.getByRole("row", { name: /Diretor Roteiro/ })).toContainText(
      staff.director.email,
    );
    await expect(directors.getByRole("row", { name: /Equipe BI Roteiro/ })).toContainText(
      staff.bi.email,
    );
    const form = await openDisclosure(dir, "Convidar diretor");
    await form.getByLabel("Nome", { exact: true }).fill("Analista BI Novo");
    await submitIn(form, "Gerar convite").click();
    await expect(dir.getByRole("status").filter({ hasText: "Convite criado" })).toBeVisible();
    const link = await dir.getByLabel("Link do convite").inputValue();
    expect(link).toMatch(/\/convite\/[A-Za-z0-9_-]{43}$/);

    const novo = await actor(browser, base);
    await novo.goto(link);
    await expect(
      novo.getByRole("heading", { level: 1, name: "Cadastro · Analista BI Novo" }),
    ).toBeVisible();
    await expect(novo.getByText(/Convite para diretor/)).toBeVisible();
    await expect(novo.getByLabel("Seu nome")).toHaveValue("Analista BI Novo");
    await novo.getByLabel("E-mail de acesso").fill("novo.e2e@fortespay.local");
    await novo.getByLabel("Senha (mínimo de 8 caracteres)").fill(PASSWORD);
    // Senha diferente na confirmação é recusada e a conta não é criada.
    await novo.getByLabel("Confirmar senha").fill(`${PASSWORD}x`);
    await novo.getByRole("button", { name: "Criar acesso" }).click();
    await expect(novo.getByText("As senhas precisam ser iguais.")).toBeVisible();
    await novo.getByLabel("Senha (mínimo de 8 caracteres)").fill(PASSWORD);
    await novo.getByLabel("Confirmar senha").fill(PASSWORD);
    await novo.getByRole("button", { name: "Criar acesso" }).click();
    await expect(novo).toHaveURL(/\/inicio$/);
    await expect(novo.getByRole("heading", { level: 1, name: "Visão geral" })).toBeVisible();
    expect(await navLabels(novo)).toContain("Equipe");

    await dir.goto("/equipe");
    await expect(
      section(dir, "Diretores").getByRole("row", { name: /Analista BI Novo/ }),
    ).toContainText("novo.e2e@fortespay.local");
    await expect(
      section(dir, "Convites de diretor").getByRole("row", { name: /Analista BI Novo/ }),
    ).toContainText("Cadastro feito");

    await ter.goto("/equipe");
    await expect(ter).toHaveURL(/\/inicio$/);
  });

  await test.step("12.6 Equipe: link de nova senha para outro diretor", async () => {
    await dir.goto("/equipe");
    const directors = section(dir, "Diretores");
    await expect(
      directors
        .getByRole("row", { name: /Diretor Roteiro/ })
        .getByRole("button", { name: "Gerar link de nova senha" }),
    ).toHaveCount(0);
    const row = directors.getByRole("row", { name: /Analista BI Novo/ });
    await row.getByRole("button", { name: "Gerar link de nova senha" }).click();
    const link = await row.getByLabel("Link de nova senha").inputValue();
    expect(link).toMatch(/\/nova-senha\/[A-Za-z0-9_-]{43}$/);

    const page = await actor(browser, base);
    await page.goto(link);
    await expect(page.getByText(/novo\.e2e@fortespay\.local/)).toBeVisible();
    await page.getByLabel("Nova senha (mínimo de 8 caracteres)").fill("Senha-novo-diretor-1");
    await page.getByLabel("Confirme a nova senha").fill("Senha-novo-diretor-1");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/login\?senha=alterada$/);
    await login(page, "novo.e2e@fortespay.local", "Senha-novo-diretor-1");
    await expect(page).toHaveURL(/\/inicio$/);
  });

  await test.step("12.7 Esqueci minha senha: o link chega por e-mail e troca a senha", async () => {
    await clearMailbox(request);
    const page = await actor(browser, base);
    await page.goto("/login");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Esqueci minha senha" }),
    ).toBeVisible();
    await page.getByLabel("E-mail", { exact: true }).fill("Teresina.E2E@fortespay.local");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Se este e-mail tiver cadastro" }),
    ).toBeVisible();
    const mail = await waitForMail(request, "teresina.e2e@fortespay.local");
    expect(mail.subject).toBe("Fortes Pay: crie sua nova senha");
    expect(mail.from).toBe("suporte@fortespay.local");
    expect(mail.text).toContain("Olá, Maria Teresina.");
    expect(mail.text).toContain("24 horas");
    const link = mail.text.match(/https?:\/\/\S+\/nova-senha\/[A-Za-z0-9_-]{43}/)?.[0] ?? "";
    expect(link.startsWith(`${base}/nova-senha/`)).toBe(true);

    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1, name: "Definir nova senha" })).toBeVisible();
    await expect(page.getByText(/teresina\.e2e@fortespay\.local/)).toBeVisible();
    await page.getByLabel("Nova senha (mínimo de 8 caracteres)").fill("Senha-teresina-email-1");
    await page.getByLabel("Confirme a nova senha").fill("Senha-teresina-email-1");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/login\?senha=alterada$/);
    await login(page, "teresina.e2e@fortespay.local", "Senha-teresina-email-1");
    await expect(page).toHaveURL(/\/inicio$/);
    // O link vale uma vez só; a tela oferece pedir outro.
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Link inválido ou expirado" })).toBeVisible();
    await page.getByRole("link", { name: "Pedir um novo link" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/);
  });

  await test.step("12.8 e-mail sem cadastro e pedido repetido: mesma resposta, nenhum e-mail a mais", async () => {
    await clearMailbox(request);
    const page = await actor(browser, base);
    await page.goto("/esqueci-senha");
    const answer = page.getByRole("status").filter({ hasText: "Se este e-mail tiver cadastro" });
    await page.getByLabel("E-mail", { exact: true }).fill("ninguem.e2e@fortespay.local");
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(answer).toBeVisible();
    // Diretor também pede a nova senha por e-mail; o segundo pedido em seguida não envia outro.
    await page.reload();
    await page.getByLabel("E-mail", { exact: true }).fill(staff.bi.email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(answer).toBeVisible();
    await waitForMail(request, staff.bi.email);
    await page.reload();
    await page.getByLabel("E-mail", { exact: true }).fill(staff.bi.email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(answer).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await mailsTo(request, staff.bi.email)).toHaveLength(1);
    expect(await mailsTo(request, "ninguem.e2e@fortespay.local")).toHaveLength(0);
    await page.getByRole("link", { name: "Voltar ao login" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
