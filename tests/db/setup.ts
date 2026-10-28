// Carrega as chaves do Supabase LOCAL antes de cada arquivo de teste de banco e remove
// fechamentos deixados por execuções anteriores (fechamento fechado trava vigências).
import { beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from("closings").delete().not("id", "is", null);
  if (error) {
    throw new Error(`Não foi possível limpar os fechamentos: ${error.message}`);
  }
});
