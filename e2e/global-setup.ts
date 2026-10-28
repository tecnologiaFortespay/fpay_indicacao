import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { adminClient, ensureStaffUser } from "../scripts/bootstrap.mjs";

export const FIXTURES_PATH = ".local/e2e-fixtures.json";

export type Fixtures = {
  password: string;
  director: { id: string; email: string };
  analyst: { id: string; email: string };
  partners: { natal: { id: string; name: string } };
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
  // Parceiro já aprovado, para o roteiro da Fatia 1 (o cadastro por convite é o roteiro da Fatia 2).
  const admin = adminClient();
  const natal = await admin
    .from("partners")
    .insert({
      name: "Unidade Natal",
      kind: "unit",
      city: "Natal",
      state: "RN",
      status: "active",
      payment_method: "pix",
      pix_key: "natal@fortespay.local",
      approved_by: director.id,
      approved_at: new Date().toISOString(),
      created_by: director.id,
    })
    .select("id, name")
    .single();
  if (natal.error) {
    throw new Error(`Não foi possível criar o parceiro de teste: ${natal.error.message}`);
  }
  const fixtures: Fixtures = { password, director, analyst, partners: { natal: natal.data } };
  await mkdir(".local", { recursive: true });
  await writeFile(FIXTURES_PATH, JSON.stringify(fixtures), { mode: 0o600 });
}
