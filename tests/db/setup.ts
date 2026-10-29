// Carrega as chaves do Supabase LOCAL (.env.test) antes de cada arquivo de teste de banco e remove
// fechamentos e importações deixados por outros arquivos: fechamento fechado trava vigências e
// mês importado sem fechamento trava os fechamentos seguintes.
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
  for (const table of ["closings", "monthly_lives", "import_batches"] as const) {
    const column = table === "monthly_lives" ? "cnpj" : "id";
    const { error } = await admin.from(table).delete().not(column, "is", null);
    if (error) {
      throw new Error(`Não foi possível limpar ${table}: ${error.message}`);
    }
  }
});
