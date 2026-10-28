import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type Client = SupabaseClient<Database>;

const options = { auth: { persistSession: false, autoRefreshToken: false } };

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Defina ${name} em .env.local (Supabase local).`);
  }
  return value;
}

export function adminClient(): Client {
  return createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    options,
  );
}

export const PASSWORD = "Senha-de-teste-123";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

// Cria um usuário no Auth e, se pedido, o perfil correspondente.
export async function createUser(
  admin: Client,
  role: "director" | "analyst" | "partner" | null,
  partnerId: string | null = null,
): Promise<{ id: string; email: string }> {
  const email = uniqueEmail(role ?? "user");
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser: ${created.error?.message}`);
  }
  if (role) {
    const profile = await admin.from("profiles").insert({
      user_id: created.data.user.id,
      role,
      partner_id: partnerId,
      display_name: `Teste ${role}`,
    });
    if (profile.error) {
      throw new Error(`profile: ${profile.error.message}`);
    }
  }
  return { id: created.data.user.id, email };
}

export async function userClient(email: string): Promise<Client> {
  const client = createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    options,
  );
  const result = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (result.error) {
    throw new Error(`signIn: ${result.error.message}`);
  }
  return client;
}

export function ok<T>(
  result: { data: T; error: { message: string } | null },
  operation: string,
): NonNullable<T> {
  if (result.error) {
    throw new Error(`${operation}: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${operation}: sem dados na resposta`);
  }
  return result.data;
}

export const CNPJ_A = "11222333000181";
export const CNPJ_B = "00000000000191";
export const CNPJ_C = "12ABC34501DE35";

export function rows(entries: [string, string, number][]) {
  return entries.map(([cnpj, competency, lives], index) => ({
    line_number: index + 2,
    cnpj,
    competency,
    lives,
    company_name: `Empresa ${cnpj}`,
    group_name: null,
  }));
}

export function batch(name: string) {
  return {
    file_name: name,
    file_hash: randomUUID().replace(/-/g, "").padEnd(64, "0"),
    rows_read: 1,
    issues: [],
  };
}

// Para chamadas sem retorno (update, funções void): falha só se houver erro.
export function done(result: { error: { message: string } | null }, operation: string): void {
  if (result.error) {
    throw new Error(`${operation}: ${result.error.message}`);
  }
}
