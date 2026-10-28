// Carrega as chaves do Supabase LOCAL (.env.test) antes de cada arquivo de teste de banco e remove
// fechamentos deixados por execuções anteriores (fechamento fechado trava vigências).
import { beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase } from "../local-only";

process.loadEnvFile(".env.test");

beforeAll(async () => {
  const url = assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Defina SUPABASE_SERVICE_ROLE_KEY em .env.test.");
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from("closings").delete().not("id", "is", null);
  if (error) {
    throw new Error(`Não foi possível limpar os fechamentos: ${error.message}`);
  }
});
