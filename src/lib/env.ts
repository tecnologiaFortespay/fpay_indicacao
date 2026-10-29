export type AuthConfig = {
  url: string;
  anonKey: string;
};

const URL_VARIABLE = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VARIABLE = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

// Valores fixados no build: a referência direta é substituída pelo Next durante o `next build`.
// Servem de reserva quando a variável não existe na execução.
const BUILD_VALUES: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_ENVIRONMENT_LABEL: process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL,
};

// Projeto Supabase da Fortes Pay. O endereço e a chave anônima são públicos por natureza (todo app
// Supabase os entrega ao navegador; quem protege os dados é a RLS). Em produção completam o que o
// servidor não informar ou informar errado, para o sistema subir sem depender do painel de
// hospedagem. Nunca se misturam com outro endereço: com o Supabase local, valem só as variáveis.
const FORTES_PAY_PROJECT = {
  url: "https://mltanrtdgyrfhsqmpcum.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sdGFucnRkZ3lyZmhzcW1wY3VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDQxMzgsImV4cCI6MjEwODc4MDEzOH0.0_qnsLvCskAJVaktSVJg1KBPoGDBSuckvMjV0Dvt9kY",
};

export type Source = "execução" | "build" | "projeto da Fortes Pay";

type Candidate = { value: string; source: Source };

// Primeiro o ambiente de execução (consulta por nome, que o Next não fixa no build), depois o valor
// do build. Espaços e aspas coladas ao valor são descartados.
function candidates(name: string): Candidate[] {
  const values: [string | undefined, Source][] = [
    [process.env[name], "execução"],
    [BUILD_VALUES[name], "build"],
  ];
  return values.flatMap(([raw, source]) => {
    const value = raw?.trim().replace(/^(["'])(.*)\1$/, "$2");
    return value ? [{ value, source }] : [];
  });
}

// Origem http(s) do endereço, sem barra final nem caminho colado (ex.: /rest/v1).
function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function jwtPayload(token: string): { role?: unknown; ref?: unknown } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// A chave precisa ser a anônima (nunca a service_role) e, num projeto supabase.co, do mesmo projeto
// do endereço.
function keyFits(key: string, url: string): boolean {
  if (key.startsWith("sb_publishable_")) {
    return true;
  }
  const payload = jwtPayload(key);
  if (payload?.role !== "anon") {
    return false;
  }
  const project = new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  return project === undefined || payload.ref === project;
}

export type ConfigurationProblem = { variable: string; issue: "faltando" | "inválida" };

export type Connection = {
  config: AuthConfig | null;
  sources: { url: Source | null; anonKey: Source | null };
  problems: ConfigurationProblem[];
};

// Escolhe o endereço e a chave do Supabase entre os valores informados, ignorando os inválidos.
// Os problemas citam só o nome da variável (nunca o valor).
export function resolveConnection(): Connection {
  const fallback = process.env.NODE_ENV === "production" ? FORTES_PAY_PROJECT : null;
  const urls = candidates(URL_VARIABLE);
  const keys = candidates(KEY_VARIABLE);

  let url: Candidate | null = null;
  for (const candidate of urls) {
    const origin = httpOrigin(candidate.value);
    if (origin) {
      url = { value: origin, source: candidate.source };
      break;
    }
  }
  if (!url && fallback) {
    url = { value: fallback.url, source: "projeto da Fortes Pay" };
  }

  let anonKey: Candidate | null = null;
  if (url) {
    anonKey = keys.find((candidate) => keyFits(candidate.value, url.value)) ?? null;
    if (!anonKey && fallback && url.value === fallback.url) {
      anonKey = { value: fallback.anonKey, source: "projeto da Fortes Pay" };
    }
  }

  const problems: ConfigurationProblem[] = [];
  if (!url) {
    problems.push({ variable: URL_VARIABLE, issue: urls.length > 0 ? "inválida" : "faltando" });
  }
  if (!anonKey && keys.length === 0) {
    problems.push({ variable: KEY_VARIABLE, issue: "faltando" });
  } else if (!anonKey && url) {
    problems.push({ variable: KEY_VARIABLE, issue: "inválida" });
  }

  return {
    config: url && anonKey ? { url: url.value, anonKey: anonKey.value } : null,
    sources: { url: url?.source ?? null, anonKey: anonKey?.source ?? null },
    problems,
  };
}

export function configurationProblems(): ConfigurationProblem[] {
  return resolveConnection().problems;
}

let reported = false;

// Null when the environment is not configured; the login page then names the variables to fix and
// the server log repeats them once (never their values).
export function authConfig(): AuthConfig | null {
  const { config, problems } = resolveConnection();
  if (!config && !reported) {
    reported = true;
    const list = problems.map((problem) => `${problem.variable} (${problem.issue})`).join(", ");
    console.error(`Configuração do Supabase incompleta: confira ${list} no ambiente do servidor.`);
  }
  return config;
}

function firstValue(header: string | null): string | undefined {
  return header?.split(",")[0]?.trim() || undefined;
}

// Endereço público do sistema, visto pela requisição: atrás do DigitalOcean o domínio chega no Host
// (ou x-forwarded-host) e o protocolo em x-forwarded-proto. Vai nos links de convite e de senha e
// decide se o cookie de sessão é só https.
export function appOrigin(headers: Headers): string {
  const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host"));
  const protocol = firstValue(headers.get("x-forwarded-proto")) === "https" ? "https" : "http";
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    return "http://localhost:3000";
  }
  return `${protocol}://${host.toLowerCase()}`;
}

export function environmentLabel(): string {
  return candidates("NEXT_PUBLIC_ENVIRONMENT_LABEL")[0]?.value ?? "";
}

// Data e hora do build (next.config.ts), mostradas no login para saber qual versão está no ar.
export function builtAt(): string | null {
  return process.env.APP_BUILT_AT ?? null;
}

export const AUTH_COOKIE = "fp-indicacao-auth";
