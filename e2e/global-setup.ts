import { assertLocalSupabase } from "../tests/local-only";

// Os testes de ponta a ponta apagam dados: só rodam contra o Supabase local (.env.test).
// Cada arquivo zera o banco e cria as contas de que precisa (e2e/helpers.ts).
export default async function globalSetup() {
  process.loadEnvFile(".env.test");
  assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
