import { beforeAll, describe, expect, it } from "vitest";
import { cnpjWithDigits } from "@/lib/cnpj";
import { addMonths, competencyToDate, currentCompetency } from "@/lib/competency";
import { adminClient, batch, createUser, done, ok, rows, userClient, type Client } from "./helpers";

let admin: Client;
let director: Client;
let noProfile: Client;
let natal: Client;
let manaus: Client;
let natalId: string;
let manausId: string;

const CNPJ_Y = cnpjWithDigits("114447770001");
const CNPJ_Z = cnpjWithDigits("223334440001");
const CNPJ_W = cnpjWithDigits("335556660001");
const CNPJ_V = cnpjWithDigits("446667770001");
// Mês anterior e mês corrente: o cancelamento feito hoje encerra a contagem a partir deste mês.
const PREVIOUS = competencyToDate(addMonths(currentCompetency(), -1));
const CURRENT = competencyToDate(currentCompetency());

async function activePartner(name: string): Promise<string> {
  const partner = ok(
    await admin
      .from("partners")
      .insert({ name, kind: "unit", status: "active" })
      .select("id")
      .single(),
    "insert partner",
  );
  return partner.id;
}

async function partnerClient(partnerId: string): Promise<Client> {
  const user = await createUser(admin, "partner", partnerId);
  return userClient(user.email);
}

async function status(client: Client, cnpj: string): Promise<string> {
  const row = ok(
    await client.from("referrals").select("status").eq("cnpj", cnpj).single(),
    "status",
  );
  return row.status;
}

beforeAll(async () => {
  admin = adminClient();
  const directorUser = await createUser(admin, "director");
  const noProfileUser = await createUser(admin, null);
  director = await userClient(directorUser.email);
  noProfile = await userClient(noProfileUser.email);
  natalId = await activePartner(`Unidade Natal ${Date.now()}`);
  manausId = await activePartner(`Unidade Manaus ${Date.now()}`);
  natal = await partnerClient(natalId);
  manaus = await partnerClient(manausId);
  const cnpjs = [CNPJ_Y, CNPJ_Z, CNPJ_W, CNPJ_V];
  await admin.from("monthly_lives").delete().in("cnpj", cnpjs);
  await admin.from("referrals").delete().in("cnpj", cnpjs);
  await admin.from("companies").delete().in("cnpj", cnpjs);
});

describe("fatia 3 — indicações com 7 situações e CNPJ único", () => {
  it("parceiro ativo registra só em nome próprio; pendente não registra", async () => {
    const id = ok(
      await natal.rpc("create_referral", {
        payload: {
          partner_id: manausId,
          cnpj: CNPJ_Y,
          company_name: "Empresa Y",
          estimated_lives: "30",
        },
      }),
      "create_referral as partner",
    );
    const referral = ok(
      await natal
        .from("referrals")
        .select("partner_id, status, estimated_lives")
        .eq("id", id)
        .single(),
      "own referral",
    );
    expect(referral).toEqual({ partner_id: natalId, status: "referred", estimated_lives: 30 });
    const pendingId = ok(
      await admin
        .from("partners")
        .insert({ name: "Pendente", kind: "unit", status: "pending" })
        .select("id")
        .single(),
      "pending partner",
    ).id;
    const pending = await partnerClient(pendingId);
    const denied = await pending.rpc("create_referral", {
      payload: { cnpj: CNPJ_Z, company_name: "Z" },
    });
    expect(denied.error?.code).toBe("42501");
  });

  // Item 1 da reunião de 09/11/2026 (decisão 22): o vendedor é um texto opcional na indicação,
  // informado por quem registra; só o diretor corrige depois. Login e comissão continuam fase 2.
  it("indicação guarda o vendedor (texto opcional); só o diretor corrige depois", async () => {
    const id = ok(
      await natal.rpc("create_referral", {
        payload: { cnpj: CNPJ_V, company_name: "Empresa V", seller_name: "  Carla  " },
      }),
      "create with seller",
    );
    const seller = async () =>
      ok(await natal.from("referrals").select("seller_name").eq("id", id).single(), "seller")
        .seller_name;
    expect(await seller()).toBe("Carla");
    const long = await natal.rpc("create_referral", {
      payload: {
        cnpj: cnpjWithDigits("557778880001"),
        company_name: "Empresa longa",
        seller_name: "x".repeat(121),
      },
    });
    expect(long.error?.details).toBe("Vendedor: use até 120 caracteres.");
    const byPartner = await natal.rpc("set_referral_seller", { target: id, name: "Outro" });
    expect(byPartner.error?.code).toBe("42501");
    done(await director.rpc("set_referral_seller", { target: id, name: " Carla Souza " }), "set");
    expect(await seller()).toBe("Carla Souza");
    done(await director.rpc("set_referral_seller", { target: id, name: "" }), "clear");
    expect(await seller()).toBeNull();
    const missing = await director.rpc("set_referral_seller", {
      target: "00000000-0000-0000-0000-000000000000",
      name: "X",
    });
    expect(missing.error?.code).toBe("P0002");
  });

  it("vale a primeira: outro parceiro recebe só a data; parceiro não vê indicações alheias", async () => {
    const duplicate = await manaus.rpc("create_referral", {
      payload: { cnpj: CNPJ_Y, company_name: "Empresa Y" },
    });
    expect(duplicate.error?.message).toBe("REFERRAL_DUPLICATE");
    expect(duplicate.error?.details).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const visible = ok(
      await manaus.from("referrals").select("id").eq("cnpj", CNPJ_Y),
      "referrals as manaus",
    );
    expect(visible).toEqual([]);
    const company = ok(
      await manaus.from("companies").select("cnpj").eq("cnpj", CNPJ_Y),
      "companies as manaus",
    );
    expect(company).toEqual([]);
  });

  it("diretor muda a situação só pelas transições permitidas; conta sem perfil não muda", async () => {
    const id = ok(
      await director.from("referrals").select("id").eq("cnpj", CNPJ_Y).single(),
      "id",
    ).id;
    const invalid = await director.rpc("set_referral_status", {
      target: id,
      new_status: "cancelled",
    });
    expect(invalid.error?.message).toBe("REFERRAL_TRANSITION");
    expect(invalid.error?.details).toBe("referred>cancelled");
    const unknown = await director.rpc("set_referral_status", { target: id, new_status: "active" });
    expect(unknown.error?.message).toBe("REFERRAL_TRANSITION");
    done(
      await director.rpc("set_referral_status", { target: id, new_status: "negotiating" }),
      "negotiating",
    );
    expect(await status(natal, CNPJ_Y)).toBe("negotiating");
    done(await director.rpc("set_referral_status", { target: id, new_status: "signed" }), "signed");
    expect(await status(natal, CNPJ_Y)).toBe("signed");
    const byNoProfile = await noProfile.rpc("set_referral_status", {
      target: id,
      new_status: "lost",
    });
    expect(byNoProfile.error?.code).toBe("42501");
    const byPartner = await natal.rpc("set_referral_status", { target: id, new_status: "lost" });
    expect(byPartner.error?.code).toBe("42501");
  });

  it("perdida sai do cálculo mesmo se o CNPJ aparecer no BI; cancelada encerra a recorrência", async () => {
    done(
      await admin
        .from("partner_rules")
        .insert({ partner_id: natalId, value_per_life: 1, valid_from: "2026-01-01" }),
      "rule",
    );
    const lostId = ok(
      await director.rpc("create_referral", {
        payload: { partner_id: natalId, cnpj: CNPJ_Z, company_name: "Z" },
      }),
      "referral Z",
    );
    done(await director.rpc("set_referral_status", { target: lostId, new_status: "lost" }), "lost");
    const cancelledId = ok(
      await director.rpc("create_referral", {
        payload: { partner_id: natalId, cnpj: CNPJ_W, company_name: "W" },
      }),
      "referral W",
    );
    // Cliente que pagou no mês anterior e no corrente (status ativo gravado direto, como a importação faria).
    done(
      await admin
        .from("referrals")
        .update({ status: "active", activated_competency: PREVIOUS })
        .eq("id", cancelledId),
      "activate W",
    );
    done(
      await director.rpc("import_lives", {
        batch: batch("zw.csv"),
        rows: rows([
          [CNPJ_Z, PREVIOUS, 5],
          [CNPJ_W, PREVIOUS, 7],
          [CNPJ_W, CURRENT, 9],
        ]),
      }),
      "import Z/W",
    );
    const before = ok(
      await natal
        .from("referral_month_lives")
        .select("cnpj, competency, lives")
        .in("cnpj", [CNPJ_Z, CNPJ_W])
        .order("competency"),
      "lives before cancel",
    );
    expect(before).toEqual([
      { cnpj: CNPJ_W, competency: PREVIOUS, lives: 7 },
      { cnpj: CNPJ_W, competency: CURRENT, lives: 9 },
    ]);
    // Cancelamento hoje: o mês anterior continua contando, o corrente não.
    done(
      await director.rpc("set_referral_status", { target: cancelledId, new_status: "cancelled" }),
      "cancel",
    );
    const after = ok(
      await natal
        .from("referral_month_lives")
        .select("cnpj, competency, lives")
        .in("cnpj", [CNPJ_Z, CNPJ_W]),
      "lives after cancel",
    );
    expect(after).toEqual([{ cnpj: CNPJ_W, competency: PREVIOUS, lives: 7 }]);
    const twice = await director.rpc("set_referral_status", {
      target: cancelledId,
      new_status: "negotiating",
    });
    expect(twice.error?.details).toBe("cancelled>negotiating");
  });
});
