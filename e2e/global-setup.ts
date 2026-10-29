import { assertLocalSupabase } from "../tests/local-only";
import { startFakeAnthropic } from "./fake-anthropic";

// Os testes de ponta a ponta apagam dados: só rodam contra o Supabase local (.env.test).
// Cada arquivo zera o banco e cria as contas de que precisa (e2e/helpers.ts).
// A IA responde por uma imitação local da API da Anthropic (e2e/fake-anthropic.ts).
export default async function globalSetup() {
  process.loadEnvFile(".env.test");
  assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const fake = await startFakeAnthropic();
  return async () => {
    await new Promise((resolve) => fake.close(resolve));
  };
}
