import { z } from "zod";

const fields = {
  url: z.url(),
  anonKey: z.string().min(1),
  appUrl: z.url().refine((value) => /^https?:\/\//.test(value)),
};

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

type Field = keyof typeof VARIABLES;

// Valores fixados no build: a referência direta é substituída pelo Next durante o `next build`.
// Servem de reserva quando a variável não existe na execução (ex.: escopo "Build time" no
// DigitalOcean).
const BUILD_VALUES: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ENVIRONMENT_LABEL: process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL,
};

// Primeiro o ambiente de execução (consulta por nome, que o Next não fixa no build), depois o valor
// do build. Aspas coladas ao valor são descartadas.
function readVariable(name: string): string | undefined {
  const value = (process.env[name] ?? BUILD_VALUES[name])?.trim();
  if (!value) {
    return undefined;
  }
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

export type ConfigurationProblem = { variable: string; issue: "faltando" | "inválida" };

// O que falta ou está inválido, só com o nome da variável (nunca o valor).
export function configurationProblems(): ConfigurationProblem[] {
  const problems: ConfigurationProblem[] = [];
  for (const field of Object.keys(VARIABLES) as Field[]) {
    const variable = VARIABLES[field];
    const value = readVariable(variable);
    if (value === undefined) {
      problems.push({ variable, issue: "faltando" });
    } else if (!fields[field].safeParse(value).success) {
      problems.push({ variable, issue: "inválida" });
    }
  }
  return problems;
}

let reported = false;

// Null when the environment is not configured; the login page then names the variables to fix and
// the server log repeats them once (never their values).
export function authConfig(): AuthConfig | null {
  const problems = configurationProblems();
  if (problems.length > 0) {
    if (!reported) {
      reported = true;
      const list = problems.map((problem) => `${problem.variable} (${problem.issue})`).join(", ");
      console.error(
        `Configuração do Supabase incompleta: confira ${list} no ambiente do servidor.`,
      );
    }
    return null;
  }
  const url = readVariable(VARIABLES.url) ?? "";
  const anonKey = readVariable(VARIABLES.anonKey) ?? "";
  const appUrl = new URL(readVariable(VARIABLES.appUrl) ?? "").origin;
  return { url, anonKey, appUrl };
}

export function environmentLabel(): string {
  return readVariable("NEXT_PUBLIC_ENVIRONMENT_LABEL") ?? "";
}

// Data e hora do build (next.config.ts), mostradas no login para saber qual versão está no ar.
export function builtAt(): string | null {
  return process.env.APP_BUILT_AT ?? null;
}

export const AUTH_COOKIE = "fp-indicacao-auth";
