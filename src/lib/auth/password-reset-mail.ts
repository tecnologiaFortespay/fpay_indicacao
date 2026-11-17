import type { Message } from "@/lib/mail";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// E-mail do "Esqueci minha senha" (decisão 26): texto simples e a mesma mensagem em HTML, com o
// link de nova senha (24 horas, uso único).
export function passwordResetMessage(account: {
  email: string;
  display_name: string;
  link: string;
}): Message {
  const name = account.display_name.trim();
  const greeting = name ? `Olá, ${name}.` : "Olá.";
  const intro =
    "Recebemos um pedido de nova senha para o seu acesso ao programa de indicação da Fortes Pay.";
  const validity = "O link vale por 24 horas e só pode ser usado uma vez.";
  const ignore =
    "Se você não pediu uma nova senha, ignore este e-mail: a sua senha continua a mesma.";
  const text = [
    greeting,
    "",
    intro,
    "Para criar a nova senha, abra o link:",
    account.link,
    "",
    validity,
    ignore,
    "",
    "Fortes Pay",
  ].join("\n");
  const link = escapeHtml(account.link);
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${intro}</p>`,
    `<p><a href="${link}">Criar nova senha</a></p>`,
    `<p>Se o link não abrir, copie este endereço no navegador:<br>${link}</p>`,
    `<p>${validity}<br>${ignore}</p>`,
    "<p>Fortes Pay</p>",
  ].join("\n");
  return { to: account.email, subject: "Fortes Pay: crie sua nova senha", text, html };
}
