import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  expect,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { adminClient, ensureStaffUser } from "../scripts/bootstrap.mjs";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PASSWORD = "Senha-e2e-12345";

export type Staff = {
  director: { id: string; email: string };
  // Quem envia a planilha do BI: outro login de diretor.
  bi: { id: string; email: string };
};

// Banco local zerado (tests/reset-data.sql, TRUNCATE direto no Postgres) e dois diretores
// criados como no `npm run bootstrap`.
export async function resetAndSeedStaff(names: { director: string; bi: string }): Promise<Staff> {
  const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_fpay_indicacao";
  execSync(`docker exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f -`, {
    input: readFileSync("tests/reset-data.sql"),
    stdio: ["pipe", "inherit", "inherit"],
  });
  const director = await ensureStaffUser({
    email: "diretor.e2e@fortespay.local",
    role: "director",
    name: names.director,
    password: PASSWORD,
  });
  const bi = await ensureStaffUser({
    email: "bi.e2e@fortespay.local",
    role: "director",
    name: names.bi,
    password: PASSWORD,
  });
  return { director, bi };
}

export { adminClient };

// Uma sessão de navegador por pessoa (cada diretor, cada parceiro).
export async function actor(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
  });
  return context.newPage();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Envia o export do BI (gerado no formato real, docs/arquivo-bi.md) para o mês informado ("YYYY-MM"),
// como na tela: "Conferir arquivo" (nada é gravado) e, se a conferência aparecer, "Confirmar e
// importar". Recusas (mês errado, colunas) aparecem já na conferência. confirm: false para só
// conferir.
export async function upload(
  page: Page,
  name: string,
  month: string,
  buffer: Uint8Array,
  options: { confirm?: boolean } = {},
) {
  await page.goto("/importacoes");
  await page.getByLabel("Mês de referência", { exact: true }).fill(month);
  await page.getByLabel("Planilha do BI", { exact: true }).setInputFiles({
    name,
    mimeType: name.toLowerCase().endsWith(".csv") ? "text/csv" : XLSX_TYPE,
    buffer: Buffer.from(buffer),
  });
  await page.getByRole("button", { name: "Conferir arquivo", exact: true }).click();
  const preview = page.getByRole("region", { name: "Conferência do envio" });
  const refusal = page.locator("form").getByRole("alert");
  await expect(preview.or(refusal)).toBeVisible({ timeout: 60000 });
  if (options.confirm === false || !(await preview.isVisible())) {
    return;
  }
  await preview.getByRole("button", { name: "Confirmar e importar", exact: true }).click();
  await page.waitForURL(/\/importacoes\/[0-9a-f-]{36}$/, { timeout: 60000 });
}

export function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

// Abre um bloco recolhível ("Nova vigência", "Gerar convite"...) se ainda estiver fechado e devolve o
// bloco, para os campos serem procurados só dentro dele.
export async function openDisclosure(page: Page, label: string | RegExp) {
  const details = page
    .locator("details.fp-disclosure")
    .filter({ has: page.locator("summary", { hasText: label }) })
    .first();
  const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await details.locator("summary").first().click();
  }
  return details;
}

// Botão de envio de um formulário dentro do bloco (o resumo do bloco tem o mesmo texto às vezes).
export function submitIn(container: Locator, name: string | RegExp) {
  return container.locator('button[type="submit"]', { hasText: name });
}

// Caixa de e-mail de teste: o Mailpit do Supabase local recebe tudo o que o sistema envia
// (SMTP_HOST e SMTP_PORT de .env.test). Nada sai para um endereço de verdade.
const MAILPIT = "http://127.0.0.1:54344";

export type Mail = { subject: string; from: string; text: string };

export async function clearMailbox(request: APIRequestContext) {
  const response = await request.delete(`${MAILPIT}/api/v1/messages`);
  expect(response.ok()).toBe(true);
}

// Mensagens recebidas pelo endereço, da mais nova para a mais antiga.
export async function mailsTo(request: APIRequestContext, address: string): Promise<Mail[]> {
  const search = await request.get(`${MAILPIT}/api/v1/search`, {
    params: { query: `to:"${address}"` },
  });
  expect(search.ok()).toBe(true);
  const { messages } = (await search.json()) as { messages: { ID: string }[] };
  const mails: Mail[] = [];
  for (const { ID } of messages) {
    const message = (await (await request.get(`${MAILPIT}/api/v1/message/${ID}`)).json()) as {
      Subject: string;
      From: { Address: string };
      Text: string;
    };
    mails.push({ subject: message.Subject, from: message.From.Address, text: message.Text });
  }
  return mails;
}

// Espera a mensagem mais nova para o endereço (o envio acontece dentro da ação do formulário).
export async function waitForMail(request: APIRequestContext, address: string): Promise<Mail> {
  let mails: Mail[] = [];
  await expect
    .poll(
      async () => {
        mails = await mailsTo(request, address);
        return mails.length;
      },
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
  return mails[0];
}
