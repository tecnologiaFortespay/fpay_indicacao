// Cria (ou atualiza) uma conta interna da Fortes Pay — sempre diretor; quem envia a planilha do BI
// também usa esse perfil — com a chave service_role.
// Uso: npm run bootstrap -- --email denis@fortespay.com.br --role director --name "Denis" [--password ...]
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const ROLES = ["director"];

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function findUserByEmail(admin, email) {
  let page = 1;
  while (page < 100) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Não foi possível listar usuários: ${error.message}`);
    }
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) {
      return found;
    }
    if (data.users.length < 200) {
      return null;
    }
    page += 1;
  }
  return null;
}

export async function ensureStaffUser({ email, role, name, password }) {
  if (!ROLES.includes(role)) {
    throw new Error(
      `Perfil inválido: ${role}. Contas internas são sempre de diretor (--role director).`,
    );
  }
  const admin = adminClient();
  const normalizedEmail = email.trim().toLowerCase();
  let user = await findUserByEmail(admin, normalizedEmail);
  let generatedPassword = null;
  if (!user) {
    const chosen = password ?? `${randomBytes(12).toString("base64url")}aA1`;
    const created = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: chosen,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (created.error) {
      throw new Error(`Não foi possível criar o usuário: ${created.error.message}`);
    }
    user = created.data.user;
    generatedPassword = password ? null : chosen;
  } else if (password) {
    const updated = await admin.auth.admin.updateUserById(user.id, { password });
    if (updated.error) {
      throw new Error(`Não foi possível atualizar a senha: ${updated.error.message}`);
    }
  }
  const profile = await admin
    .from("profiles")
    .upsert(
      { user_id: user.id, role, display_name: name, partner_id: null },
      { onConflict: "user_id" },
    );
  if (profile.error) {
    throw new Error(`Não foi possível gravar o perfil: ${profile.error.message}`);
  }
  return { id: user.id, email: normalizedEmail, role, generatedPassword };
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      role: { type: "string" },
      name: { type: "string" },
      password: { type: "string" },
    },
  });
  if (!values.email) {
    console.error(
      "Uso: npm run bootstrap -- --email <e-mail> [--role director] --name <nome> [--password <senha>]",
    );
    process.exit(1);
  }
  const name = values.name ?? values.email.split("@")[0];
  const result = await ensureStaffUser({
    email: values.email,
    role: values.role ?? "director",
    name,
    password: values.password,
  });
  console.log(`Usuário ${result.email} com perfil ${result.role}.`);
  if (result.generatedPassword) {
    console.log(`Senha gerada (guarde agora, não é mostrada de novo): ${result.generatedPassword}`);
  }
}

// Sem import.meta: o arquivo também é importado pelo setup dos testes de ponta a ponta (transpilado para CommonJS).
const invokedDirectly = Boolean(process.argv[1]?.endsWith("scripts/bootstrap.mjs"));
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
