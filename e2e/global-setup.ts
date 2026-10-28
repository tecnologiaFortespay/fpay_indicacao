import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { ensureStaffUser } from "../scripts/bootstrap.mjs";

export const FIXTURES_PATH = ".local/e2e-fixtures.json";

export type Fixtures = {
  password: string;
  director: { id: string; email: string };
  analyst: { id: string; email: string };
};

// Os testes de ponta a ponta rodam contra o Supabase LOCAL, zerado a cada execução.
export default async function globalSetup() {
  process.loadEnvFile(".env.local");
  execSync("npx supabase db reset", { stdio: "inherit" });
  const password = "Senha-e2e-12345";
  const director = await ensureStaffUser({
    email: "diretor.e2e@fortespay.local",
    role: "director",
    name: "Diretor E2E",
    password,
  });
  const analyst = await ensureStaffUser({
    email: "analista.e2e@fortespay.local",
    role: "analyst",
    name: "Analista E2E",
    password,
  });
  const fixtures: Fixtures = { password, director, analyst };
  await mkdir(".local", { recursive: true });
  await writeFile(FIXTURES_PATH, JSON.stringify(fixtures), { mode: 0o600 });
}
