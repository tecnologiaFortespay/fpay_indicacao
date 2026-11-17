import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordResetMessage } from "./auth/password-reset-mail";
import { mailLinkOrigin } from "./env";
import { mailSettings, missingMailVariables } from "./mail";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure(values: Record<string, string | undefined>) {
  for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]) {
    vi.stubEnv(name, values[name]);
  }
}

describe("mailSettings", () => {
  it("sem servidor ou remetente o envio fica desligado e diz o que falta", () => {
    configure({});
    expect(mailSettings()).toBeNull();
    expect(missingMailVariables()).toEqual(["SMTP_HOST", "SMTP_FROM"]);
    configure({ SMTP_HOST: "smtp.exemplo.com.br" });
    expect(missingMailVariables()).toEqual(["SMTP_FROM"]);
  });

  it("porta 587 quando não informada; usuário e senha são opcionais (servidor de teste)", () => {
    configure({ SMTP_HOST: " 127.0.0.1 ", SMTP_FROM: "Fortes Pay <suporte@fortespay.local>" });
    expect(mailSettings()).toEqual({
      host: "127.0.0.1",
      port: 587,
      user: null,
      password: null,
      from: "Fortes Pay <suporte@fortespay.local>",
    });
  });

  it("porta inválida desliga o envio", () => {
    configure({ SMTP_HOST: "smtp.exemplo.com.br", SMTP_FROM: "a@b.co", SMTP_PORT: "abc" });
    expect(mailSettings()).toBeNull();
    expect(missingMailVariables()).toEqual([]);
  });
});

describe("mailLinkOrigin", () => {
  const request = new Headers({ host: "preview-abc.vercel.app", "x-forwarded-proto": "https" });

  it("na Vercel, o link do e-mail usa o domínio de produção, não o Host do pedido", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "fpay-indicacao.vercel.app");
    expect(mailLinkOrigin(request)).toBe("https://fpay-indicacao.vercel.app");
  });

  it("fora da Vercel (ou com valor estranho), usa o endereço da requisição", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
    expect(mailLinkOrigin(request)).toBe("https://preview-abc.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "evil.example/caminho");
    expect(mailLinkOrigin(request)).toBe("https://preview-abc.vercel.app");
  });
});

describe("passwordResetMessage", () => {
  const link = "https://fpay-indicacao.vercel.app/nova-senha/abcDEF_123-xyz";

  it("leva o link, a validade e o aviso para quem não pediu, em texto e em HTML", () => {
    const message = passwordResetMessage({
      email: "ana@exemplo.com.br",
      display_name: "Ana",
      link,
    });
    expect(message.to).toBe("ana@exemplo.com.br");
    expect(message.subject).toBe("Fortes Pay: crie sua nova senha");
    expect(message.text).toContain("Olá, Ana.");
    expect(message.text).toContain(link);
    expect(message.text).toContain("24 horas");
    expect(message.text).toContain("Se você não pediu");
    expect(message.html).toContain(`<a href="${link}">Criar nova senha</a>`);
  });

  it("o nome do cadastro não vira HTML no e-mail", () => {
    const message = passwordResetMessage({
      email: "x@exemplo.com.br",
      display_name: '<img src=x onerror="alert(1)">',
      link,
    });
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
