import { defineConfig, devices } from "@playwright/test";
import { assertLocalSupabase } from "./tests/local-only";

// Os testes de ponta a ponta usam só o Supabase local (.env.test); .env.local nunca é lido aqui.
process.loadEnvFile(".env.test");
const supabaseUrl = assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL);

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices["Desktop Chrome"],
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240000,
    // As variáveis NEXT_PUBLIC_* entram no build; passadas aqui, o Next não lê .env.local.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
      NEXT_PUBLIC_ENVIRONMENT_LABEL: process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL ?? "Teste",
    },
  },
});
