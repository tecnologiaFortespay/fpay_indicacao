import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  batch,
  CNPJ_A,
  CNPJ_B,
  CNPJ_C,
  createUser,
  ok,
  rows,
  userClient,
  type Client,
} from "./helpers";

let director: Client;
let analyst: Client;
let natalId: string;

async function savePartner(client: Client, name: string) {
  return ok(
    await client.rpc("save_partner", {
      payload: {
        name,
        kind: "unit",
        city: "Natal",
        state: "RN",
        payment_method: "pix",
        pix_key: `${name}@pix`,
      },
    }),
    "save_partner",
  );
}

async function amounts(client: Client, partnerId: string) {
  const result = await client
    .from("partner_month_amounts")
    .select("competency, lives, value_per_life, amount")
    .eq("partner_id", partnerId)
    .order("competency");
  return ok(result, "partner_month_amounts");
}

async function referralStatus(client: Client, cnpj: string) {
  const result = await client
    .from("referrals")
    .select("status, activated_competency")
    .eq("cnpj", cnpj)
    .single();
  return ok(result, "referral");
}

beforeAll(async () => {
  const admin = adminClient();
  const directorUser = await createUser(admin, "director");
  const analystUser = await createUser(admin, "analyst");
  director = await userClient(directorUser.email);
  analyst = await userClient(analystUser.email);
  // O banco local é compartilhado entre execuções: limpa o que estes CNPJs deixaram da última vez.
  const testCnpjs = [CNPJ_A, CNPJ_B, CNPJ_C];
  await admin.from("monthly_lives").delete().in("cnpj", testCnpjs);
  await admin.from("referrals").delete().in("cnpj", testCnpjs);
  await admin.from("companies").delete().in("cnpj", testCnpjs);
});

describe("fatia 1 — importação e cálculo vidas × valor vigente", () => {
  it("diretor cadastra parceiro, regra e indicação; a importação calcula vidas × valor", async () => {
    natalId = await savePartner(director, `Unidade Natal ${Date.now()}`);
    ok(
      await director.rpc("save_partner_rule", {
        payload: {
          partner_id: natalId,
          value_per_life: "1.50",
          valid_from: "2099-08-01",
          term_months: "",
        },
      }),
      "save_partner_rule",
    );
    ok(
      await director.rpc("create_referral", {
        payload: { partner_id: natalId, cnpj: "11.222.333/0001-81", company_name: "Empresa A" },
      }),
      "create_referral",
    );
    ok(
      await director.rpc("import_lives", {
        batch: batch("setembro.csv"),
        rows: rows([
          [CNPJ_A, "2099-09-01", 48],
          [CNPJ_B, "2099-09-01", 10],
        ]),
      }),
      "import_lives",
    );
    expect(await amounts(director, natalId)).toEqual([
      { competency: "2099-09-01", lives: 48, value_per_life: 1.5, amount: 72 },
    ]);
    expect(await referralStatus(director, CNPJ_A)).toEqual({
      status: "active",
      activated_competency: "2099-09-01",
    });
  });

  it("subir de novo substitui o mês em vez de somar", async () => {
    ok(
      await director.rpc("import_lives", {
        batch: batch("setembro-repetido.csv"),
        rows: rows([[CNPJ_A, "2099-09-01", 48]]),
      }),
      "import_lives (repeat)",
    );
    expect((await amounts(director, natalId))[0]).toMatchObject({ lives: 48, amount: 72 });
    ok(
      await director.rpc("import_lives", {
        batch: batch("setembro-v2.csv"),
        rows: rows([[CNPJ_A, "2099-09-01", 50]]),
      }),
      "import_lives (v2)",
    );
    expect((await amounts(director, natalId))[0]).toMatchObject({ lives: 50, amount: 75 });
  });

  it("no mês mais recente, CNPJ ausente fica inadimplente e volta a ativo quando reaparece", async () => {
    ok(
      await director.rpc("import_lives", {
        batch: batch("outubro-sem-a.xlsx", "2099-10-01"),
        rows: rows([[CNPJ_B, "2099-10-01", 10]]),
      }),
      "import_lives (october without A)",
    );
    expect((await referralStatus(director, CNPJ_A)).status).toBe("delinquent");
    expect(await amounts(director, natalId)).toHaveLength(1);
    ok(
      await director.rpc("import_lives", {
        batch: batch("outubro-com-a.csv"),
        rows: rows([[CNPJ_A, "2099-10-01", 52]]),
      }),
      "import_lives (october with A)",
    );
    expect(await referralStatus(director, CNPJ_A)).toEqual({
      status: "active",
      activated_competency: "2099-09-01",
    });
    expect(await amounts(director, natalId)).toEqual([
      { competency: "2099-09-01", lives: 50, value_per_life: 1.5, amount: 75 },
      { competency: "2099-10-01", lives: 52, value_per_life: 1.5, amount: 78 },
    ]);
  });

  it("vigência nova vale só a partir do mês dela", async () => {
    ok(
      await director.rpc("save_partner_rule", {
        payload: {
          partner_id: natalId,
          value_per_life: "2.00",
          valid_from: "2099-10-01",
          term_months: "",
        },
      }),
      "save_partner_rule (october)",
    );
    expect(await amounts(director, natalId)).toEqual([
      { competency: "2099-09-01", lives: 50, value_per_life: 1.5, amount: 75 },
      { competency: "2099-10-01", lives: 52, value_per_life: 2, amount: 104 },
    ]);
    const duplicate = await director.rpc("save_partner_rule", {
      payload: {
        partner_id: natalId,
        value_per_life: "3.00",
        valid_from: "2099-10-01",
        term_months: "",
      },
    });
    expect(duplicate.error?.message).toBe("RULE_DUPLICATE");
  });

  it("CNPJ já indicado é recusado com a data da primeira indicação", async () => {
    const otherId = await savePartner(director, `Unidade Teresina ${Date.now()}`);
    const result = await director.rpc("create_referral", {
      payload: { partner_id: otherId, cnpj: CNPJ_A, company_name: "Tentativa" },
    });
    expect(result.error?.message).toBe("REFERRAL_DUPLICATE");
    expect(result.error?.details).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("prazo em meses encerra a contagem a partir do primeiro pagamento do cliente", async () => {
    const accountantId = await savePartner(director, `Contador ${Date.now()}`);
    ok(
      await director.rpc("save_partner_rule", {
        payload: {
          partner_id: accountantId,
          value_per_life: "1.00",
          valid_from: "2099-01-01",
          term_months: "1",
        },
      }),
      "save_partner_rule (term)",
    );
    ok(
      await director.rpc("create_referral", {
        payload: { partner_id: accountantId, cnpj: CNPJ_C, company_name: "Empresa C" },
      }),
      "create_referral (C)",
    );
    ok(
      await director.rpc("import_lives", {
        batch: batch("c-dois-meses.csv"),
        rows: rows([
          [CNPJ_C, "2099-09-01", 7],
          [CNPJ_C, "2099-10-01", 9],
          [CNPJ_A, "2099-10-01", 52],
        ]),
      }),
      "import_lives (C)",
    );
    expect(await amounts(director, accountantId)).toEqual([
      { competency: "2099-09-01", lives: 7, value_per_life: 1, amount: 7 },
    ]);
  });

  it("analista importa, mas não enxerga parceiros nem regras e não grava cadastro", async () => {
    const partners = ok(await analyst.from("partners").select("id"), "partners as analyst");
    expect(partners).toEqual([]);
    const rules = ok(await analyst.from("partner_rules").select("id"), "rules as analyst");
    expect(rules).toEqual([]);
    const denied = await analyst.rpc("save_partner", {
      payload: { name: "X", kind: "unit", payment_method: "card" },
    });
    expect(denied.error?.code).toBe("42501");
    ok(
      await analyst.rpc("import_lives", {
        batch: batch("analista.csv"),
        rows: rows([[CNPJ_B, "2099-10-01", 11]]),
      }),
      "import_lives as analyst",
    );
    const batches = ok(await analyst.from("import_batches").select("id"), "batches as analyst");
    expect(batches.length).toBeGreaterThan(0);
  });

  it("importação rejeita linha inválida e CNPJ repetido no mesmo mês", async () => {
    const invalid = await director.rpc("import_lives", {
      batch: batch("x.csv"),
      rows: rows([["123", "2099-09-01", 1]]),
    });
    expect(invalid.error?.message).toBe("IMPORT_FIELDS");
    const repeated = await director.rpc("import_lives", {
      batch: batch("y.csv"),
      rows: rows([
        [CNPJ_B, "2099-09-01", 1],
        [CNPJ_B, "2099-09-01", 2],
      ]),
    });
    expect(repeated.error?.message).toBe("IMPORT_FIELDS");
  });

  it("empresas sem indicação na plataforma são contadas e não gravadas", async () => {
    const id = ok(
      await director.rpc("import_lives", {
        batch: batch("novembro.xlsx", "2099-11-01"),
        rows: rows([
          [CNPJ_A, "2099-11-01", 30],
          [CNPJ_B, "2099-11-01", 5],
        ]),
      }),
      "import_lives (november)",
    );
    const saved = ok(
      await director
        .from("import_batches")
        .select("rows_imported, rows_skipped, rows_ignored, competencies")
        .eq("id", id)
        .single(),
      "batch (november)",
    );
    expect(saved).toEqual({
      rows_imported: 1,
      rows_skipped: 1,
      rows_ignored: 0,
      competencies: ["2099-11-01"],
    });
    expect(
      ok(await director.from("companies").select("cnpj").eq("cnpj", CNPJ_B), "companies"),
    ).toEqual([]);
    expect(
      ok(await director.from("monthly_lives").select("cnpj").eq("cnpj", CNPJ_B), "lives"),
    ).toEqual([]);
  });

  it("arquivo do mês sem nenhuma empresa indicada ainda cobre o mês: ativos ficam inadimplentes", async () => {
    const id = ok(
      await director.rpc("import_lives", {
        batch: batch("dezembro.xlsx", "2099-12-01"),
        rows: rows([[CNPJ_B, "2099-12-01", 5]]),
      }),
      "import_lives (december)",
    );
    const saved = ok(
      await director
        .from("import_batches")
        .select("rows_imported, rows_skipped, competencies")
        .eq("id", id)
        .single(),
      "batch (december)",
    );
    expect(saved).toEqual({ rows_imported: 0, rows_skipped: 1, competencies: ["2099-12-01"] });
    expect((await referralStatus(director, CNPJ_A)).status).toBe("delinquent");
  });
});
