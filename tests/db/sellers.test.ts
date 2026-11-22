import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { cnpjWithDigits } from "@/lib/cnpj";
import { addMonths, competencyToDate, currentCompetency } from "@/lib/competency";
import type { Database } from "@/lib/supabase/types";
import {
  adminClient,
  batch,
  createUser,
  done,
  ok,
  rows,
  uniqueEmail,
  userClient,
  type Client,
} from "./helpers";

// Decisão 29 (22/11/2026): perfil de vendedor. Pede a conta com o e-mail da unidade, o diretor
// aprova, e ele só registra e vê as próprias indicações, sem ler tabela nem valor nenhum.

type Account = { id: string; email: string };

let admin: Client;
let director: Client;
let directorUser: Account;
let unitId: string;
let otherId: string;
let unitUser: Account;
let unit: Client;
let other: Client;
let sellerUser: Account;
let seller: Client;
let colleagueUser: Account;
let colleague: Client;

const CNPJ_SELLER = cnpjWithDigits("601112220001");
const CNPJ_COLLEAGUE = cnpjWithDigits("602223330001");
const CNPJ_UNIT = cnpjWithDigits("603334440001");
const CNPJ_OTHER = cnpjWithDigits("604445550001");
const CNPJ_DIRECTOR = cnpjWithDigits("605556660001");
const CNPJ_DENIED = cnpjWithDigits("606667770001");
const PREVIOUS = competencyToDate(addMonths(currentCompetency(), -1));
const NOT_FOUND =
  "Não encontramos uma unidade ativa com este e-mail. Confira com a sua unidade o e-mail que ela usa para entrar no sistema.";

// O que o vendedor não pode ler de jeito nenhum: as tabelas e as duas views de valores.
const FORBIDDEN_TABLES = [
  "partners",
  "partner_rules",
  "companies",
  "referrals",
  "monthly_lives",
  "import_batches",
  "import_rows",
  "invitations",
  "closings",
  "closing_items",
  "ai_reviews",
] as const;
const FORBIDDEN_VIEWS = ["referral_month_lives", "partner_month_amounts"] as const;

function anonClient(): Client {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function partner(name: string, status: "active" | "pending", contactEmail?: string) {
  const row = ok(
    await admin
      .from("partners")
      .insert({ name, kind: "unit", status, contact_email: contactEmail ?? null })
      .select("id")
      .single(),
    "insert partner",
  );
  return row.id;
}

async function expectNothingReadable(client: Client, ownUserId: string) {
  for (const table of FORBIDDEN_TABLES) {
    const result = await client.from(table).select("*").limit(5);
    expect(result.error, table).toBeNull();
    expect(result.data, table).toEqual([]);
  }
  for (const view of FORBIDDEN_VIEWS) {
    const result = await client.from(view).select("*").limit(5);
    expect(result.error, view).toBeNull();
    expect(result.data, view).toEqual([]);
  }
  const profiles = ok(await client.from("profiles").select("user_id"), "profiles");
  expect(profiles).toEqual([{ user_id: ownUserId }]);
}

async function register(client: Client, name: string, unitEmail: string) {
  return client.rpc("register_seller", { payload: { name, unit_email: unitEmail } });
}

beforeAll(async () => {
  admin = adminClient();
  directorUser = await createUser(admin, "director");
  director = await userClient(directorUser.email);
  const cnpjs = [CNPJ_SELLER, CNPJ_COLLEAGUE, CNPJ_UNIT, CNPJ_OTHER, CNPJ_DIRECTOR, CNPJ_DENIED];
  await admin.from("monthly_lives").delete().in("cnpj", cnpjs);
  await admin.from("referrals").delete().in("cnpj", cnpjs);
  await admin.from("companies").delete().in("cnpj", cnpjs);
  unitId = await partner(`Unidade dos vendedores ${Date.now()}`, "active");
  otherId = await partner(`Outra unidade ${Date.now()}`, "active");
  unitUser = await createUser(admin, "partner", unitId);
  unit = await userClient(unitUser.email);
  other = await userClient((await createUser(admin, "partner", otherId)).email);
  ok(
    await director.rpc("save_partner_rule", {
      payload: {
        partner_id: unitId,
        value_per_life: "1.50",
        valid_from: competencyToDate(addMonths(currentCompetency(), -3)),
        term_months: "",
      },
    }),
    "unit rule",
  );
  sellerUser = await createUser(admin, null);
  seller = await userClient(sellerUser.email);
  colleagueUser = await createUser(admin, null);
  colleague = await userClient(colleagueUser.email);
});

describe("decisão 29 — perfil de vendedor", () => {
  it("o vendedor pede a conta com o e-mail da unidade e o pedido nasce pendente", async () => {
    const anonymous = await register(anonClient(), "Sem conta", unitUser.email);
    expect(anonymous.error?.code).toBe("42501");
    const noName = await register(seller, "  ", unitUser.email);
    expect(noName.error?.details).toBe("Informe o seu nome.");
    const badEmail = await register(seller, "Carla", "unidade sem arroba");
    expect(badEmail.error?.details).toBe("Informe o e-mail da unidade.");
    const unknown = await register(seller, "Carla", uniqueEmail("ninguem"));
    expect(unknown.error?.message).toBe("REGISTRATION_FIELDS");
    expect(unknown.error?.details).toBe(NOT_FOUND);
    // Unidade ainda não aprovada não recebe vendedor.
    const pendingId = await partner("Unidade pendente", "pending");
    const pendingUnit = await createUser(admin, "partner", pendingId);
    const toPending = await register(seller, "Carla", pendingUnit.email);
    expect(toPending.error?.details).toBe(NOT_FOUND);
    // E-mail de login da unidade, com maiúsculas e espaços.
    done(await register(seller, " Carla Vendedora ", `  ${unitUser.email.toUpperCase()} `), "ask");
    const profile = ok(
      await admin
        .from("profiles")
        .select("role, status, partner_id, display_name")
        .eq("user_id", sellerUser.id)
        .single(),
      "seller profile",
    );
    expect(profile).toEqual({
      role: "seller",
      status: "pending",
      partner_id: unitId,
      display_name: "Carla Vendedora",
    });
    expect(ok(await seller.rpc("current_profile"), "current_profile")).toMatchObject({
      role: "seller",
      status: "pending",
      partner: { id: unitId, status: "active", rejection_reason: null },
    });
    // Reenviar o pedido não muda nada; conta que já tem outro perfil não vira vendedor.
    done(await register(seller, "Outro nome", unitUser.email), "ask again");
    const again = ok(
      await admin.from("profiles").select("display_name").eq("user_id", sellerUser.id),
      "profile again",
    );
    expect(again).toEqual([{ display_name: "Carla Vendedora" }]);
    for (const client of [director, unit]) {
      const taken = await register(client, "Já tenho perfil", unitUser.email);
      expect(taken.error?.message).toBe("ALREADY_REGISTERED");
    }
    const asPartner = await seller.rpc("register_partner", {
      payload: {
        name: "Vendedor virando parceiro",
        city: "Teresina",
        state: "PI",
        contact_name: "Carla",
        contact_phone: "(86) 99999-0000",
      },
    });
    expect(asPartner.error?.message).toBe("ALREADY_REGISTERED");
  });

  it("acha a unidade também pelo e-mail de contato, quando ele é de um parceiro só", async () => {
    const contact = uniqueEmail("contato");
    const byContactId = await partner(`Unidade pelo contato ${Date.now()}`, "active", contact);
    const first = await createUser(admin, null);
    done(await register(await userClient(first.email), "Vendedor do contato", contact), "contact");
    const linked = ok(
      await admin.from("profiles").select("partner_id").eq("user_id", first.id).single(),
      "linked",
    );
    expect(linked.partner_id).toBe(byContactId);
    // Dois parceiros ativos com o mesmo e-mail de contato: não dá para saber qual é.
    await partner(`Unidade gêmea ${Date.now()}`, "active", contact);
    const second = await createUser(admin, null);
    const ambiguous = await register(await userClient(second.email), "Outro vendedor", contact);
    expect(ambiguous.error?.details).toBe(NOT_FOUND);
  });

  it("vendedor pendente não lê nem grava nada", async () => {
    const referral = await seller.rpc("create_referral", {
      payload: { cnpj: CNPJ_DENIED, company_name: "Empresa negada" },
    });
    expect(referral.error?.code).toBe("42501");
    expect((await seller.rpc("seller_referrals")).error?.code).toBe("42501");
    expect((await seller.rpc("recent_imports")).error?.code).toBe("42501");
    expect((await seller.rpc("list_sellers")).error?.code).toBe("42501");
    const selfApproval = await seller.rpc("set_seller_status", {
      target: sellerUser.id,
      new_status: "active",
    });
    expect(selfApproval.error?.code).toBe("42501");
    await expectNothingReadable(seller, sellerUser.id);
  });

  it("só o diretor aprova, recusa e libera de novo; a lista traz o e-mail e a unidade", async () => {
    const byUnit = await unit.rpc("set_seller_status", {
      target: sellerUser.id,
      new_status: "active",
    });
    expect(byUnit.error?.code).toBe("42501");
    const invalid = await director.rpc("set_seller_status", {
      target: sellerUser.id,
      new_status: "pending",
    });
    expect(invalid.error?.details).toBe("Informe se libera ou retira o acesso do vendedor.");
    const notSeller = await director.rpc("set_seller_status", {
      target: directorUser.id,
      new_status: "rejected",
    });
    expect(notSeller.error?.code).toBe("P0002");
    const listed = ok(await director.rpc("list_sellers"), "list_sellers").find(
      (row) => row.user_id === sellerUser.id,
    );
    expect(listed).toMatchObject({
      display_name: "Carla Vendedora",
      email: sellerUser.email,
      partner_id: unitId,
      status: "pending",
    });
    done(
      await director.rpc("set_seller_status", { target: sellerUser.id, new_status: "active" }),
      "approve",
    );
    const twice = await director.rpc("set_seller_status", {
      target: sellerUser.id,
      new_status: "active",
    });
    expect(twice.error?.details).toBe("Este vendedor já está com o acesso liberado.");
    // Um colega da mesma unidade, já aprovado.
    done(await register(colleague, "Colega", unitUser.email), "colleague asks");
    done(
      await director.rpc("set_seller_status", { target: colleagueUser.id, new_status: "active" }),
      "approve colleague",
    );
  });

  it("vendedor aprovado registra em nome da unidade e o vendedor da indicação é o e-mail dele", async () => {
    const id = ok(
      await seller.rpc("create_referral", {
        payload: {
          partner_id: otherId,
          cnpj: CNPJ_SELLER,
          company_name: "Empresa do vendedor",
          estimated_lives: "12",
          seller_name: "Fulano",
        },
      }),
      "create as seller",
    );
    const stored = ok(
      await admin
        .from("referrals")
        .select("partner_id, seller_name, created_by, status")
        .eq("id", id)
        .single(),
      "stored referral",
    );
    expect(stored).toEqual({
      partner_id: unitId,
      seller_name: sellerUser.email,
      created_by: sellerUser.id,
      status: "referred",
    });
    const withValue = await seller.rpc("create_referral", {
      payload: { cnpj: CNPJ_DENIED, company_name: "Com valor", value_per_life: "9.00" },
    });
    expect(withValue.error?.details).toBe(
      "Valor e prazo da indicação são definidos pela Fortes Pay.",
    );
    const duplicate = await colleague.rpc("create_referral", {
      payload: { cnpj: CNPJ_SELLER, company_name: "De novo" },
    });
    expect(duplicate.error?.message).toBe("REFERRAL_DUPLICATE");
    expect(duplicate.error?.details).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    // A unidade grava o próprio e-mail; o diretor continua escrevendo texto livre (ou nada).
    ok(
      await unit.rpc("create_referral", {
        payload: { cnpj: CNPJ_UNIT, company_name: "Empresa da unidade", seller_name: "Fulano" },
      }),
      "create as unit",
    );
    ok(
      await director.rpc("create_referral", {
        payload: {
          partner_id: unitId,
          cnpj: CNPJ_DIRECTOR,
          company_name: "Empresa do diretor",
          seller_name: " Bruno ",
        },
      }),
      "create as director",
    );
    ok(
      await colleague.rpc("create_referral", {
        payload: { cnpj: CNPJ_COLLEAGUE, company_name: "Empresa do colega" },
      }),
      "create as colleague",
    );
    ok(
      await other.rpc("create_referral", {
        payload: { cnpj: CNPJ_OTHER, company_name: "Empresa de outra unidade" },
      }),
      "create as other unit",
    );
    // A unidade vê as indicações dela com o vendedor de cada uma.
    const unitView = ok(
      await unit.from("referrals").select("cnpj, seller_name").order("cnpj"),
      "unit view",
    );
    expect(unitView).toEqual([
      { cnpj: CNPJ_SELLER, seller_name: sellerUser.email },
      { cnpj: CNPJ_COLLEAGUE, seller_name: colleagueUser.email },
      { cnpj: CNPJ_UNIT, seller_name: unitUser.email },
      { cnpj: CNPJ_DIRECTOR, seller_name: "Bruno" },
    ]);
  });

  it("vendedor vê só as próprias indicações, com as vidas do mês e nenhuma coluna de valor", async () => {
    const before = ok(await seller.rpc("seller_referrals"), "seller_referrals");
    expect(before).toHaveLength(1);
    expect(Object.keys(before[0]).sort()).toEqual([
      "activated_competency",
      "cnpj",
      "company_name",
      "competency",
      "created_at",
      "id",
      "lives",
      "status",
      "status_changed_at",
    ]);
    expect(before[0]).toMatchObject({
      cnpj: CNPJ_SELLER,
      company_name: "Empresa do vendedor",
      status: "referred",
      competency: null,
      lives: 0,
    });
    ok(
      await director.rpc("import_lives", {
        batch: batch("vendedores.csv", PREVIOUS),
        rows: rows([
          [CNPJ_SELLER, PREVIOUS, 7],
          [CNPJ_UNIT, PREVIOUS, 9],
          [CNPJ_OTHER, PREVIOUS, 5],
        ]),
      }),
      "import",
    );
    const after = ok(await seller.rpc("seller_referrals"), "seller_referrals after import");
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      cnpj: CNPJ_SELLER,
      status: "active",
      competency: PREVIOUS,
      lives: 7,
    });
    // O mesmo número que a unidade vê, pela view dela.
    const unitLives = ok(
      await unit
        .from("referral_month_lives")
        .select("lives")
        .eq("cnpj", CNPJ_SELLER)
        .eq("competency", PREVIOUS)
        .single(),
      "unit lives",
    );
    expect(unitLives.lives).toBe(7);
    // O colega vê a dele (sem vidas no mês), não a do outro vendedor nem a da unidade.
    const colleagueView = ok(await colleague.rpc("seller_referrals"), "colleague view");
    expect(colleagueView.map((row) => [row.cnpj, row.lives])).toEqual([[CNPJ_COLLEAGUE, 0]]);
    // Mesmo aprovado, o vendedor não lê tabela nenhuma; unidade e diretor não usam a lista dele.
    await expectNothingReadable(seller, sellerUser.id);
    expect((await seller.rpc("recent_imports")).error?.code).toBe("42501");
    expect((await seller.rpc("list_sellers")).error?.code).toBe("42501");
    for (const client of [unit, director]) {
      expect((await client.rpc("seller_referrals")).error?.code).toBe("42501");
      expect(ok(await client.rpc("recent_imports"), "recent_imports").length).toBeGreaterThan(0);
    }
  });

  it("acesso removido: o vendedor para de ver e de registrar; a indicação fica com a unidade", async () => {
    done(
      await director.rpc("set_seller_status", { target: sellerUser.id, new_status: "rejected" }),
      "remove access",
    );
    expect((await seller.rpc("seller_referrals")).error?.code).toBe("42501");
    const denied = await seller.rpc("create_referral", {
      payload: { cnpj: CNPJ_DENIED, company_name: "Empresa negada" },
    });
    expect(denied.error?.code).toBe("42501");
    await expectNothingReadable(seller, sellerUser.id);
    const kept = ok(
      await unit.from("referrals").select("seller_name").eq("cnpj", CNPJ_SELLER).single(),
      "kept referral",
    );
    expect(kept.seller_name).toBe(sellerUser.email);
    const twice = await director.rpc("set_seller_status", {
      target: sellerUser.id,
      new_status: "rejected",
    });
    expect(twice.error?.details).toBe("Este vendedor já está sem acesso.");
    done(
      await director.rpc("set_seller_status", { target: sellerUser.id, new_status: "active" }),
      "release again",
    );
    expect(ok(await seller.rpc("seller_referrals"), "after release")).toHaveLength(1);
  });

  it("o banco recusa vendedor sem unidade e situação pendente fora do vendedor", async () => {
    const account = await createUser(admin, null);
    const sellerWithoutUnit = await admin.from("profiles").insert({
      user_id: account.id,
      role: "seller",
      partner_id: null,
      display_name: "Sem unidade",
    });
    expect(sellerWithoutUnit.error?.code).toBe("23514");
    const pendingDirector = await admin.from("profiles").insert({
      user_id: account.id,
      role: "director",
      partner_id: null,
      display_name: "Diretor pendente",
      status: "pending",
    });
    expect(pendingDirector.error?.code).toBe("23514");
    const rejectedPartner = await admin.from("profiles").insert({
      user_id: account.id,
      role: "partner",
      partner_id: unitId,
      display_name: "Parceiro recusado",
      status: "rejected",
    });
    expect(rejectedPartner.error?.code).toBe("23514");
  });
});
