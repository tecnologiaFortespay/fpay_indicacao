import { expect, test, type APIRequestContext } from "@playwright/test";
import { fixtures } from "./helpers";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54344";

// Lê o e-mail de recuperação no Mailpit do Supabase local e devolve o link de verificação.
async function recoveryLink(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await request.get(
      `${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(email)}`,
    );
    const list = (await search.json()) as { messages?: { ID: string; Subject: string }[] };
    const candidates = list.messages ?? [];
    for (const message of candidates) {
      const detail = await request.get(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
      const body = (await detail.json()) as { Text?: string; HTML?: string };
      const text = `${body.Text ?? ""}\n${(body.HTML ?? "").replace(/&amp;/g, "&")}`;
      const match = text.match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify[^\s"<>]+/);
      if (match) {
        await request.delete(`${MAILPIT_URL}/api/v1/messages`, { data: { IDs: [message.ID] } });
        return match[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("E-mail de recuperação não chegou ao Mailpit.");
}

test("recuperação de senha pelo link do e-mail", async ({ page, request }) => {
  const run = fixtures();
  const email = run.analyst.email;
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Se houver uma conta" })).toBeVisible();

  const link = await recoveryLink(request, email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/redefinir-senha$/);
  const newPassword = "Nova-senha-e2e-999";
  await page.getByLabel("Nova senha (mínimo de 8 caracteres)").fill(newPassword);
  await page.getByLabel("Confirme a nova senha").fill(newPassword);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/login\?senha=alterada$/);
  await expect(page.getByRole("status").filter({ hasText: "Senha alterada" })).toBeVisible();

  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/importacoes$/);
});
