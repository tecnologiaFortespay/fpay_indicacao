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
  login,
  openDisclosure,
  PASSWORD,
  recoveryLink,
  resetAndSeedStaff,
  submitIn,
  upload,
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
  const all = [...referred, ...OTHERS, ...INVALID];
  return format === "csv" ? biExportCsv(all, month) : biExport(all, month);
}

const AUGUST = exportFor(AUG, { A: 30, B: 20, D: 50, E: 10 });
const SEPTEMBER = exportFor(SEP, { A: 33, B: 22, D: 55, E: 12 });
const SEPTEMBER_A8 = exportFor(SEP, { A: 41, B: 22, D: 55, E: 12 });
const OCTOBER = exportFor(OCT, { A: 37, D: 58, E: 23 });
// Envio parcial seguinte do mesmo mês: A fechou mais vidas. Vem em CSV, como o Google Planilhas
// exporta (nomes só nos subtotais, números com ponto de milhar).
const OCTOBER_UPDATE = exportFor(OCT, { A: 40, D: 58, E: 23 }, "csv");

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

async function createInvite(director: Page, name: string, kind: string) {
  await director.goto("/parceiros");
  const form = await openDisclosure(director, "Gerar convite");
  await form.getByLabel("Nome da unidade ou do parceiro").fill(name);
  await form.getByRole("combobox", { name: "Tipo" }).selectOption({ label: kind });
  await submitIn(form, "Gerar convite").click();
  return form.getByLabel("Link do convite").inputValue();
}

async function register(
  page: Page,
  link: string,
  data: { contact: string; city: string; state: string; phone: string; email: string },
) {
  await page.goto(link);
  await page.getByLabel("Cidade").fill(data.city);
  await page.getByLabel("UF").fill(data.state);
  await page.getByLabel("Nome do responsável").fill(data.contact);
  await page.getByLabel("Telefone").fill(data.phone);
  await page.getByLabel("E-mail de acesso").fill(data.email);
  await page.getByLabel("Senha (mínimo de 8 caracteres)").fill(PASSWORD);
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
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

async function approve(director: Page, rule: { value: string; from: string; term: string }) {
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

async function refer(page: Page, entry: Company, estimated?: string) {
  await page.goto("/indicacoes");
  const form = await openDisclosure(page, "Nova indicação");
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
  test.setTimeout(10 * 60 * 1000);
  const base = baseURL ?? "http://localhost:3100";
  const staff = await resetAndSeedStaff({
    director: "Diretor Roteiro",
    bi: "Equipe BI Roteiro",
  });
  await request.delete("http://127.0.0.1:54344/api/v1/messages");
  const anon = await actor(browser, base);
  const dir = await actor(browser, base);
  // Quem envia a planilha do BI usa um login de diretor próprio (decisão 14).
  const bi = await actor(browser, base);
  const ter = await actor(browser, base);
  const nat = await actor(browser, base);
  const con = await actor(browser, base);
  const rec = await actor(browser, base);
  const pen = await actor(browser, base);
  const ids: Record<string, string> = {};
  let teresinaLink = "";
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

  await test.step("2.1 sem Novo parceiro; convite de 7 dias, link exibido uma vez", async () => {
    await dir.goto("/parceiros");
    await expect(dir.getByText("Novo parceiro")).toHaveCount(0);
    const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const invite = await openDisclosure(dir, "Gerar convite");
    await expect(invite.getByLabel(/^Válido até/)).toHaveValue(sevenDays);
    teresinaLink = await createInvite(dir, "Unidade Teresina", "Unidade");
    expect(teresinaLink).toMatch(/\/convite\/[A-Za-z0-9_-]{40,}$/);
    await dir.reload();
    await expect(dir.getByLabel("Link do convite")).toHaveCount(0);
  });

  await test.step("2.2 cadastro pelo link fica em análise, inclusive em /inicio", async () => {
    await ter.goto(teresinaLink);
    await expect(
      ter.getByRole("heading", { level: 1, name: "Cadastro · Unidade Teresina" }),
    ).toBeVisible();
    await expect(ter.getByText(/válido até \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await register(ter, teresinaLink, {
      contact: "Maria Teresina",
      city: "Teresina",
      state: "PI",
      phone: "(86) 99999-0000",
      email: "teresina.e2e@fortespay.local",
    });
    await expect(ter.getByRole("heading", { level: 1, name: "Cadastro em análise" })).toBeVisible();
    await ter.goto("/inicio");
    await expect(ter).toHaveURL(/\/cadastro-em-analise$/);
  });

  await test.step("2.3 link usado e link alterado", async () => {
    await ter.goto(teresinaLink);
    await expect(
      ter.getByRole("heading", { level: 1, name: "Convite já utilizado" }),
    ).toBeVisible();
    const changed = teresinaLink.slice(0, -1) + (teresinaLink.endsWith("A") ? "B" : "A");
    await ter.goto(changed);
    await expect(ter.getByRole("heading", { level: 1, name: "Convite inválido" })).toBeVisible();
  });

  await test.step("2.4 aprovar sem valor por vida é bloqueado", async () => {
    ids.teresina = await openPending(dir, "Unidade Teresina");
    await dir.getByRole("button", { name: "Aprovar e liberar acesso" }).click();
    const value = dir.getByLabel("Valor por vida (R$)");
    expect(await value.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(
      true,
    );
    await expect(dir.getByRole("heading", { name: "Aprovar o cadastro" })).toBeVisible();
  });

  await test.step("2.5 aprovar com 1,50 desde agosto, sem prazo: ficha Ativo", async () => {
    const rules = await approve(dir, { value: "1,50", from: AUG, term: "" });
    expect(rules).toContain(`${AUG_LABEL} R$ 1,50 sem prazo`);
    await expect(dir.locator(".fp-facts")).toContainText("Ativo");
  });

  await test.step("2.6 o parceiro recarrega e entra em Meu painel", async () => {
    await ter.goto("/cadastro-em-analise");
    await ter.reload();
    await expect(ter).toHaveURL(/\/inicio$/);
    await expect(ter.getByRole("heading", { level: 1, name: "Meu painel" })).toBeVisible();
    await expect(ter.locator(".fp-page-intro")).toContainText("Unidade Teresina");
  });

  await test.step("2.7 Unidade Natal: 2,00 desde agosto, sem prazo", async () => {
    const link = await createInvite(dir, "Unidade Natal", "Unidade");
    await register(nat, link, {
      contact: "João Natal",
      city: "Natal",
      state: "RN",
      phone: "(84) 98888-0000",
      email: "natal.e2e@fortespay.local",
    });
    ids.natal = await openPending(dir, "Unidade Natal");
    expect(await approve(dir, { value: "2,00", from: AUG, term: "" })).toContain(
      `${AUG_LABEL} R$ 2,00 sem prazo`,
    );
    await nat.reload();
    await expect(nat).toHaveURL(/\/inicio$/);
  });

  await test.step("2.8 Contador Fulano, Parceiro externo: 1,50 desde agosto, 12 meses", async () => {
    const link = await createInvite(dir, "Contador Fulano", "Parceiro externo");
    await register(con, link, {
      contact: "Fulano de Tal",
      city: "Fortaleza",
      state: "CE",
      phone: "(85) 97777-0000",
      email: "contador.e2e@fortespay.local",
    });
    ids.contador = await openPending(dir, "Contador Fulano");
    expect(await approve(dir, { value: "1,50", from: AUG, term: "12" })).toContain(
      `${AUG_LABEL} R$ 1,50 12 meses`,
    );
    await expect(dir.locator(".fp-facts")).toContainText("Parceiro externo");
    await con.reload();
    await expect(con).toHaveURL(/\/inicio$/);
  });

  await test.step("2.9 recusa com motivo; fora da lista de ativos", async () => {
    const link = await createInvite(dir, "Unidade Recusa", "Unidade");
    await register(rec, link, {
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

  await test.step("3.1 Teresina indica A: Indicada, com data", async () => {
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

  await test.step("5.3 painel de Teresina em agosto: só A e B", async () => {
    await ter.goto(`/inicio?competency=${AUG}`);
    const month = clean(await section(ter, `${AUG_LABEL} · prévia`).innerText());
    expect(month).toContain("Sua regra no mês: R$ 1,50 por vida · sem prazo.");
    expect(month).toContain("Vidas pagas no mês inteiro 50");
    expect(month).toContain("Valor previsto prévia R$ 75,00");
    const rows = section(ter, /Minhas indicações/).locator("tbody tr");
    await expect(rows).toHaveCount(2);
    expect(await rowText(ter, A.company)).toContain("30 R$ 1,50 R$ 45,00");
    expect(await rowText(ter, B.company)).toContain("20 R$ 1,50 R$ 30,00");
    await expect(ter.getByText(/Prévia com a base do BI de/)).toBeVisible();
    await expect(ter.getByText(D.company)).toHaveCount(0);
  });

  await test.step("5.4 painel do contador mostra o prazo: 12 meses, ago/2026 a jul/2027", async () => {
    await con.goto("/inicio");
    await expect(
      con.getByText(/^Sua regra no mês: R\$\s1,50 por vida · prazo de 12 meses\.$/),
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

  await test.step("6.1 outubro: preparar cálculo bloqueado, mês ainda não encerrado", async () => {
    await dir.goto(`/fechamento?competency=${OCT}`);
    await expect(dir.locator(".fp-steps")).toContainText(`${OCT_LABEL} ainda não terminou`);
    await expect(dir.getByRole("button", { name: "Preparar cálculo" })).toHaveCount(0);
  });

  await test.step("6.2 setembro com agosto aberto: feche agosto primeiro", async () => {
    await dir.goto(`/fechamento?competency=${SEP}`);
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

  await test.step("6.5 fechar sem confirmar é bloqueado; fecha pagando Teresina e Natal", async () => {
    await dir.getByRole("button", { name: "Fechar lote" }).click();
    await expect(dir.getByRole("alert").filter({ hasText: "Confirme que conferiu" })).toBeVisible();
    await dir.getByRole("checkbox", { name: /Unidade Teresina/ }).check();
    await dir.getByRole("checkbox", { name: /Unidade Natal/ }).check();
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

  await test.step("6.8 reenviar agosto: linhas ignoradas, fechamento intacto", async () => {
    await dir.goto(`/fechamento?competency=${AUG}`);
    const before = clean(await dir.locator("tfoot").first().innerText());
    await upload(bi, "Detalhamento Empresas - agosto.xlsx", AUG, AUGUST);
    await batchSummary(bi);
    await expect(
      bi.getByRole("cell", { name: `Mês já fechado (${AUG_NUMERIC}); a linha não entrou.` }),
    ).toHaveCount(4);
    await dir.reload();
    expect(clean(await dir.locator("tfoot").first().innerText())).toBe(before);
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
  });

  await test.step("6.13 resposta do parceiro: confirmou com data, contestou com texto, sem resposta", async () => {
    await dir.goto(`/fechamento?competency=${AUG}`);
    const response = (name: RegExp) => dir.getByRole("row", { name }).locator("td").nth(7);
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

  await test.step("7.2 os três pagos; saldo pendente zera", async () => {
    for (const name of [/Unidade Teresina/, /Unidade Natal/, /Contador Fulano/]) {
      await dir.getByRole("checkbox", { name }).check();
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
    await expect(teresina.nth(2)).toHaveText("R$ 75,00");
    await expect(teresina.nth(6)).toContainText("Pagar");
    await expect(teresina.nth(6)).toContainText(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
    await expect(teresina.nth(6)).toContainText("Diretor Roteiro");
  });

  await test.step("7.4 Teresina em outubro: A a 1,80; setembro continua 1,50", async () => {
    await ter.goto(`/inicio?competency=${OCT}`);
    await expect(
      ter.getByText(/^Sua regra no mês: R\$\s1,80 por vida · sem prazo\.$/),
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
  });

  await test.step("8.5 D cancelada: não conta em outubro; agosto e setembro intactos", async () => {
    await changeStatus(dir, D, "cancelled", "Cancelada");
    await nat.goto("/inicio");
    const october = section(nat, `${OCT_LABEL} · prévia`);
    await expect(october.locator(".fp-kpi-heading span").first()).toContainText("até o dia");
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
      client.rpc("set_referral_config", { target: ids.teresina, payload: {} }),
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
    const link = await createInvite(dir, "Unidade Pendente", "Unidade");
    await register(pen, link, {
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
    await dir.getByLabel("Valor por vida desta indicação (R$)").fill("2,50");
    await dir.getByLabel("Prazo desta indicação (meses)").fill("3");
    await dir.getByRole("button", { name: "Salvar valor e prazo" }).click();
    await expect(
      dir.getByRole("status").filter({ hasText: "Valor e prazo da indicação salvos." }),
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
        .nth(5),
    ).toHaveText("R$ 75,00");
  });

  await test.step("10.3 Teresina vê o valor e o prazo próprios de A", async () => {
    await ter.goto("/inicio");
    expect(await rowText(ter, A.company)).toContain(
      `40 R$ 2,50 R$ 100,00 3 meses: ${shortCompetencyLabel(AUG)} a ${shortCompetencyLabel(addMonths(AUG, 2))}`,
    );
  });

  await test.step("10.4 sem configuração, A volta à regra do parceiro", async () => {
    await dir.goto("/indicacoes");
    await dir.getByRole("link", { name: A.company }).click();
    await expect(dir).toHaveURL(/\/indicacoes\/[0-9a-f-]{36}$/);
    await expect(dir.getByRole("heading", { name: "Valor e prazo desta indicação" })).toBeVisible();
    await dir.getByLabel("Valor por vida desta indicação (R$)").fill("");
    await dir.getByLabel("Prazo desta indicação (meses)").fill("");
    await dir.getByRole("button", { name: "Salvar valor e prazo" }).click();
    await expect(
      dir.getByRole("status").filter({ hasText: "Valor e prazo da indicação salvos." }),
    ).toBeVisible();
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

  await test.step("12.4 esqueci minha senha por e-mail (Mailpit): a nova entra, a antiga não", async () => {
    const email = "contador.e2e@fortespay.local";
    const page = await actor(browser, base);
    await page.goto("/login");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/);
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Se houver uma conta" })).toBeVisible();
    await page.goto(await recoveryLink(request, email));
    await expect(page.getByRole("heading", { level: 1, name: "Definir nova senha" })).toBeVisible();
    await page.getByLabel("Nova senha (mínimo de 8 caracteres)").fill(NEW_PASSWORD);
    await page.getByLabel("Confirme a nova senha").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/login\?senha=alterada$/);
    await login(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/inicio$/);
    const old = await actor(browser, base);
    await old.goto("/login");
    await old.getByLabel("E-mail", { exact: true }).fill(email);
    await old.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await old.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      old.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." }),
    ).toBeVisible();
  });
});
