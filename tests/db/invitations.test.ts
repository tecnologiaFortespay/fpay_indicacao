import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import {
  adminClient,
  createUser,
  done,
  ok,
  PASSWORD,
  uniqueEmail,
  userClient,
  type Client,
} from "./helpers";

let admin: Client;
let director: Client;
let noProfile: Client;

function anonClient(): Client {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function futureDate(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function invite(name: string, kind = "unit"): Promise<{ id: string; secret: string }> {
  const secret = randomBytes(32).toString("base64url");
  const id = ok(
    await director.rpc("create_invitation", {
      payload: { partner_name: name, kind, valid_until: futureDate(7), secret },
    }),
    "create_invitation",
  );
  return { id, secret };
}

async function registerWithNewUser(secret: string, payload: Record<string, string>) {
  const user = await createUser(admin, null);
  const client = await userClient(user.email);
  const result = await client.rpc("register_partner", { secret, payload });
  return { user, client, result };
}

beforeAll(async () => {
  admin = adminClient();
  const directorUser = await createUser(admin, "director");
  const noProfileUser = await createUser(admin, null);
  director = await userClient(directorUser.email);
  noProfile = await userClient(noProfileUser.email);
});

describe("fatia 2 — convite, cadastro e aprovação", () => {
  it("diretor gera convite; quem abre o link vê só nome, tipo e validade", async () => {
    const { secret } = await invite("Unidade Teresina");
    const preview = ok(
      await anonClient().rpc("invitation_preview", { secret }),
      "invitation_preview",
    );
    expect(preview).toMatchObject({
      partner_name: "Unidade Teresina",
      kind: "unit",
      status: "open",
    });
    const missing = await anonClient().rpc("invitation_preview", { secret: "nao-existe" });
    expect(missing.data).toBeNull();
    const denied = await noProfile.rpc("create_invitation", {
      payload: {
        partner_name: "X",
        kind: "unit",
        valid_until: futureDate(1),
        secret: randomBytes(32).toString("base64url"),
      },
    });
    expect(denied.error?.code).toBe("42501");
  });

  it("cadastro pelo link cria parceiro pendente e perfil; o link não serve duas vezes", async () => {
    const { secret } = await invite("Unidade Natal");
    const { client, result } = await registerWithNewUser(secret, {
      name: "Unidade Natal",
      city: "Natal",
      state: "rn",
      contact_name: "Ana",
    });
    const partnerId = ok(result, "register_partner");
    const profile = ok(await client.rpc("current_profile"), "current_profile") as {
      role: string;
      partner: { id: string; status: string };
    };
    expect(profile.role).toBe("partner");
    expect(profile.partner).toMatchObject({ id: partnerId, status: "pending" });
    const own = ok(
      await client.from("partners").select("name, state, status").eq("id", partnerId).single(),
      "own partner",
    );
    expect(own).toEqual({ name: "Unidade Natal", state: "RN", status: "pending" });
    const again = await client.rpc("register_partner", {
      secret,
      payload: { name: "Unidade Natal", contact_name: "Ana" },
    });
    expect(again.data).toBe(partnerId);
    const other = await registerWithNewUser(secret, { name: "Outra", contact_name: "Bia" });
    expect(other.result.error?.message).toBe("INVITATION_INVALID");
    const preview = ok(
      await anonClient().rpc("invitation_preview", { secret }),
      "preview after use",
    );
    expect(preview).toMatchObject({ status: "used" });
  });

  it("convite válido confirma o e-mail da conta recém-criada (Confirm email ligado)", async () => {
    const { secret } = await invite("Unidade Mossoró");
    const email = uniqueEmail("mossoro");
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD });
    const account = created.data.user?.id ?? "";
    expect(created.data.user?.email_confirmed_at ?? null).toBeNull();

    const wrongSecret = await anonClient().rpc("confirm_invited_signup", {
      secret: "nao-existe",
      account,
    });
    expect(wrongSecret.data).toBe(false);
    const confirmed = await anonClient().rpc("confirm_invited_signup", { secret, account });
    expect(confirmed.data).toBe(true);
    const again = await anonClient().rpc("confirm_invited_signup", { secret, account });
    expect(again.data).toBe(false);

    const user = await admin.auth.admin.getUserById(account);
    expect(user.data.user?.email_confirmed_at).toBeTruthy();
    const client = await userClient(email);
    const partnerId = ok(
      await client.rpc("register_partner", {
        secret,
        payload: { name: "Unidade Mossoró", city: "Mossoró", state: "RN", contact_name: "Rita" },
      }),
      "register_partner",
    );
    expect(partnerId).toBeTruthy();
  });

  it("convite não confirma conta que já tem perfil", async () => {
    const { secret } = await invite("Unidade Caicó");
    const created = await admin.auth.admin.createUser({
      email: uniqueEmail("caico"),
      password: PASSWORD,
    });
    const account = created.data.user?.id ?? "";
    done(
      await admin
        .from("profiles")
        .insert({ user_id: account, role: "director", display_name: "Diretor" }),
      "profile",
    );
    const result = await anonClient().rpc("confirm_invited_signup", { secret, account });
    expect(result.data).toBe(false);
  });

  it("só existem os perfis diretor e parceiro (o de analista saiu em 04/11/2026)", async () => {
    const created = await admin.auth.admin.createUser({
      email: uniqueEmail("ex-analista"),
      password: PASSWORD,
    });
    const result = await admin
      .from("profiles")
      .insert({ user_id: created.data.user?.id ?? "", role: "analyst", display_name: "Analista" });
    expect(result.error?.code).toBe("23514");
  });

  it("convite expirado não cadastra", async () => {
    const { id, secret } = await invite("Unidade Expirada");
    done(
      await admin
        .from("invitations")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", id),
      "expire",
    );
    const preview = ok(await anonClient().rpc("invitation_preview", { secret }), "preview expired");
    expect(preview).toMatchObject({ status: "expired" });
    const { result } = await registerWithNewUser(secret, {
      name: "Unidade Expirada",
      contact_name: "Caio",
    });
    expect(result.error?.message).toBe("INVITATION_INVALID");
  });

  it("aprovação exige a regra (sem meio de pagamento); depois o parceiro entra e lê só o que é dele", async () => {
    const { secret } = await invite("Unidade Manaus");
    const { client, result } = await registerWithNewUser(secret, {
      name: "Unidade Manaus",
      contact_name: "Dora",
    });
    const partnerId = ok(result, "register_partner");
    const base = {
      partner_id: partnerId,
      value_per_life: "2.00",
      valid_from: "2026-10-01",
      term_months: "",
    };
    const noValue = await director.rpc("approve_partner", {
      payload: { partner_id: partnerId, valid_from: "2026-10-01" },
    });
    expect(noValue.error?.details).toBe("Informe o valor por vida (ex.: 1,50).");
    const noStart = await director.rpc("approve_partner", {
      payload: { partner_id: partnerId, value_per_life: "2.00" },
    });
    expect(noStart.error?.details).toBe("Informe o mês de início da vigência.");
    const noProfileTry = await noProfile.rpc("approve_partner", { payload: base });
    expect(noProfileTry.error?.code).toBe("42501");
    done(await director.rpc("approve_partner", { payload: base }), "approve");
    const approved = ok(
      await director.from("partners").select("status").eq("id", partnerId).single(),
      "approved",
    );
    expect(approved).toEqual({ status: "active" });
    const rules = ok(
      await client
        .from("partner_rules")
        .select("value_per_life, valid_from, term_months")
        .eq("partner_id", partnerId),
      "own rules",
    );
    expect(rules).toEqual([{ value_per_life: 2, valid_from: "2026-10-01", term_months: null }]);
    const allPartners = ok(await client.from("partners").select("id"), "partners as partner");
    expect(allPartners).toEqual([{ id: partnerId }]);
    const invitations = ok(await client.from("invitations").select("id"), "invitations as partner");
    expect(invitations).toEqual([]);
    const alreadyActive = await director.rpc("approve_partner", { payload: base });
    expect(alreadyActive.error?.details).toBe("Este parceiro já está ativo.");
  });

  it("recusa guarda o motivo e só vale para cadastro pendente", async () => {
    const { secret } = await invite("Indicador Recusado", "external");
    const { client, result } = await registerWithNewUser(secret, {
      name: "Indicador Recusado",
      contact_name: "Eva",
    });
    const partnerId = ok(result, "register_partner");
    const noReason = await director.rpc("reject_partner", { target: partnerId, reason: " " });
    expect(noReason.error?.message).toBe("APPROVAL_FIELDS");
    done(
      await director.rpc("reject_partner", { target: partnerId, reason: "Fora da área." }),
      "reject",
    );
    const profile = ok(await client.rpc("current_profile"), "current_profile") as {
      partner: { status: string; rejection_reason: string };
    };
    expect(profile.partner).toMatchObject({
      status: "rejected",
      rejection_reason: "Fora da área.",
    });
    const twice = await director.rpc("reject_partner", { target: partnerId, reason: "De novo." });
    expect(twice.error?.details).toBe("Só um cadastro pendente pode ser recusado.");
  });
});
