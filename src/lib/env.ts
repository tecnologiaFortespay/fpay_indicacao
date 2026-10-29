import { z } from "zod";

const schema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
  appUrl: z.url(),
});

export type AuthConfig = {
  url: string;
  anonKey: string;
  appUrl: string;
};

const VARIABLES = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  appUrl: "NEXT_PUBLIC_APP_URL",
} as const;

// Lido no servidor em tempo de execução: a consulta por nome (process.env[name]) não é fixada no
// build pelo Next, então o valor vem do ambiente em que o servidor sobe (ex.: DigitalOcean), com ou
// sem a variável disponível durante o build. Aspas coladas junto do valor são descartadas.
function readVariable(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

let reported = false;

// Null when the environment is not configured; pages then show an "unavailable" message and the
// server log names the variables to fix (never their values).
export function authConfig(): AuthConfig | null {
  const parsed = schema.safeParse({
    url: readVariable(VARIABLES.url),
    anonKey: readVariable(VARIABLES.anonKey),
    appUrl: readVariable(VARIABLES.appUrl),
  });
  if (!parsed.success) {
    if (!reported) {
      reported = true;
      const names = parsed.error.issues.map(
        (issue) => VARIABLES[issue.path[0] as keyof typeof VARIABLES],
      );
      console.error(
        `Configuração do Supabase incompleta: confira ${names.join(", ")} no ambiente do servidor.`,
      );
    }
    return null;
  }
  const origin = new URL(parsed.data.appUrl);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    return null;
  }
  return { ...parsed.data, appUrl: origin.origin };
}

export function environmentLabel(): string {
  return readVariable("NEXT_PUBLIC_ENVIRONMENT_LABEL") ?? "";
}

export const AUTH_COOKIE = "fp-indicacao-auth";
