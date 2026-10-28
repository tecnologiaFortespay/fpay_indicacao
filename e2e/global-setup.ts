import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { adminClient, ensureStaffUser } from "../scripts/bootstrap.mjs";

export const FIXTURES_PATH = ".local/e2e-fixtures.json";

export type FixturePartner = { id: string; name: string; email: string };

export type Fixtures = {
  password: string;
  director: { id: string; email: string };
  analyst: { id: string; email: string };
  partners: { natal: FixturePartner; manaus: FixturePartner };
};

type Admin = ReturnType<typeof adminClient>;

// Parceiro já aprovado com um usuário vinculado (o cadastro por convite é o roteiro da Fatia 2).
async function activePartner(
  admin: Admin,
  input: {
    name: string;
    city: string;
    state: string;
    email: string;
    password: string;
    directorId: string;
  },
): Promise<FixturePartner> {
  const partner = await admin
    .from("partners")
    .insert({
      name: input.name,
      kind: "unit",
      city: input.city,
      state: input.state,
      status: "active",
      payment_method: "pix",
      pix_key: `${input.city.toLowerCase()}@fortespay.local`,
      approved_by: input.directorId,
      approved_at: new Date().toISOString(),
      created_by: input.directorId,
    })
    .select("id, name")
    .single();
  if (partner.error) {
    throw new Error(`Não foi possível criar o parceiro de teste: ${partner.error.message}`);
  }
  const user = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (user.error || !user.data.user) {
    throw new Error(`Não foi possível criar o usuário do parceiro: ${user.error?.message}`);
  }
  const profile = await admin.from("profiles").insert({
    user_id: user.data.user.id,
    role: "partner",
    partner_id: partner.data.id,
    display_name: `Responsável ${input.city}`,
  });
  if (profile.error) {
    throw new Error(`Não foi possível criar o perfil do parceiro: ${profile.error.message}`);
  }
  return { id: partner.data.id, name: partner.data.name, email: input.email };
}

// Os testes de ponta a ponta rodam contra o Supabase LOCAL, com os dados zerados a cada execução
// (TRUNCATE direto no Postgres: `supabase db reset` reinicia contêineres e é lento).
function resetLocalData() {
  const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_fpay_indicacao";
  execSync(`docker exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f -`, {
    input: readFileSync("tests/reset-data.sql"),
    stdio: ["pipe", "inherit", "inherit"],
  });
}

export default async function globalSetup() {
  process.loadEnvFile(".env.local");
  resetLocalData();
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
  const admin = adminClient();
  const natal = await activePartner(admin, {
    name: "Unidade Natal",
    city: "Natal",
    state: "RN",
    email: "natal.e2e@fortespay.local",
    password,
    directorId: director.id,
  });
  const manaus = await activePartner(admin, {
    name: "Unidade Manaus",
    city: "Manaus",
    state: "AM",
    email: "manaus.e2e@fortespay.local",
    password,
    directorId: director.id,
  });
  const fixtures: Fixtures = { password, director, analyst, partners: { natal, manaus } };
  await mkdir(".local", { recursive: true });
  await writeFile(FIXTURES_PATH, JSON.stringify(fixtures), { mode: 0o600 });
}
