import "server-only";
import { createTransport } from "nodemailer";

// Envio de e-mail pela caixa de suporte da Fortes Pay (decisão 26). Só o "Esqueci minha senha" usa.
// As credenciais ficam em variáveis do servidor (nunca NEXT_PUBLIC_): SMTP_HOST, SMTP_PORT (587 se
// vazio), SMTP_USER, SMTP_PASSWORD e SMTP_FROM, o remetente que a pessoa vê.
export type MailSettings = {
  host: string;
  port: number;
  user: string | null;
  password: string | null;
  from: string;
};

function variable(name: string): string | null {
  return process.env[name]?.trim() || null;
}

// Nomes das variáveis obrigatórias que faltam (nunca os valores), para a tela e o /status.
export function missingMailVariables(): string[] {
  return ["SMTP_HOST", "SMTP_FROM"].filter((name) => variable(name) === null);
}

export function mailSettings(): MailSettings | null {
  const host = variable("SMTP_HOST");
  const from = variable("SMTP_FROM");
  const port = Number(variable("SMTP_PORT") ?? 587);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return { host, port, user: variable("SMTP_USER"), password: variable("SMTP_PASSWORD"), from };
}

export type Message = { to: string; subject: string; text: string; html: string };

// Envia uma mensagem; lança erro se o servidor de e-mail recusar ou não responder.
export async function sendMail(message: Message): Promise<void> {
  const settings = mailSettings();
  if (!settings) {
    throw new Error("Envio de e-mail não configurado.");
  }
  const transport = createTransport({
    host: settings.host,
    port: settings.port,
    // 465 já começa cifrada; nas outras portas a conexão é cifrada antes do login (STARTTLS).
    // Sem usuário (servidor de teste local, sem TLS) a mensagem segue como o servidor aceitar.
    secure: settings.port === 465,
    requireTLS: settings.port !== 465 && settings.user !== null,
    auth: settings.user ? { user: settings.user, pass: settings.password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({ from: settings.from, ...message });
  } finally {
    transport.close();
  }
}
