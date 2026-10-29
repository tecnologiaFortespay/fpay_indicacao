import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, resolveConnection } from "./env";

const PROJECT_URL = "https://mltanrtdgyrfhsqmpcum.supabase.co";

function jwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.assinatura`;
}

function configure(url: string | undefined, anonKey: string | undefined) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveConnection", () => {
  it("usa o endereço e a chave informados, reduzindo o endereço à origem", () => {
    const key = jwt({ ref: "mltanrtdgyrfhsqmpcum", role: "anon" });
    configure(` "${PROJECT_URL}/rest/v1/" `, key);
    const connection = resolveConnection();
    expect(connection.config).toEqual({ url: PROJECT_URL, anonKey: key });
    expect(connection.sources).toEqual({ url: "execução", anonKey: "execução" });
    expect(connection.problems).toEqual([]);
  });

  it("aceita a chave de demonstração do Supabase local", () => {
    const key = jwt({ iss: "supabase-demo", role: "anon" });
    configure("http://127.0.0.1:54341", key);
    expect(resolveConnection().config).toEqual({ url: "http://127.0.0.1:54341", anonKey: key });
  });

  it("fora de produção, sem variáveis, aponta as duas como faltando", () => {
    configure(undefined, undefined);
    const connection = resolveConnection();
    expect(connection.config).toBeNull();
    expect(connection.problems).toEqual([
      { variable: "NEXT_PUBLIC_SUPABASE_URL", issue: "faltando" },
      { variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY", issue: "faltando" },
    ]);
  });

  it("recusa a chave service_role e a chave de outro projeto", () => {
    configure(PROJECT_URL, jwt({ ref: "mltanrtdgyrfhsqmpcum", role: "service_role" }));
    expect(resolveConnection().problems).toEqual([
      { variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY", issue: "inválida" },
    ]);
    configure(PROJECT_URL, jwt({ ref: "outroprojeto", role: "anon" }));
    expect(resolveConnection().problems).toEqual([
      { variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY", issue: "inválida" },
    ]);
  });

  it("em produção, sem variáveis, usa o projeto da Fortes Pay", () => {
    vi.stubEnv("NODE_ENV", "production");
    configure(undefined, undefined);
    const connection = resolveConnection();
    expect(connection.config?.url).toBe(PROJECT_URL);
    expect(connection.sources).toEqual({
      url: "projeto da Fortes Pay",
      anonKey: "projeto da Fortes Pay",
    });
    expect(connection.problems).toEqual([]);
  });

  it("em produção, ignora valores inválidos e completa com o projeto da Fortes Pay", () => {
    vi.stubEnv("NODE_ENV", "production");
    configure("mltanrtdgyrfhsqmpcum.supabase.co", "NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...");
    expect(resolveConnection().config?.url).toBe(PROJECT_URL);
    configure(PROJECT_URL, jwt({ ref: "mltanrtdgyrfhsqmpcum", role: "service_role" }));
    expect(resolveConnection().sources).toEqual({
      url: "execução",
      anonKey: "projeto da Fortes Pay",
    });
  });

  it("em produção, nunca junta a chave da Fortes Pay a outro endereço", () => {
    vi.stubEnv("NODE_ENV", "production");
    configure("http://127.0.0.1:54341", undefined);
    const connection = resolveConnection();
    expect(connection.config).toBeNull();
    expect(connection.problems).toEqual([
      { variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY", issue: "faltando" },
    ]);
  });
});

describe("appOrigin", () => {
  it("usa o domínio e o protocolo repassados pelo proxy da hospedagem", () => {
    const headers = new Headers({
      host: "fpay-indicacao-abc.ondigitalocean.app",
      "x-forwarded-proto": "https",
    });
    expect(appOrigin(headers)).toBe("https://fpay-indicacao-abc.ondigitalocean.app");
  });

  it("prefere x-forwarded-host e o primeiro valor de listas", () => {
    const headers = new Headers({
      host: "10.0.0.5:8080",
      "x-forwarded-host": "indicacao.fortespay.com.br, interno",
      "x-forwarded-proto": "https,http",
    });
    expect(appOrigin(headers)).toBe("https://indicacao.fortespay.com.br");
  });

  it("sem proxy, fica em http com o Host da requisição", () => {
    expect(appOrigin(new Headers({ host: "localhost:3100" }))).toBe("http://localhost:3100");
  });

  it("descarta Host malformado", () => {
    expect(appOrigin(new Headers({ host: "evil.com/caminho" }))).toBe("http://localhost:3000");
  });
});
