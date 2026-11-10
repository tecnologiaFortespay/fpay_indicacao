import { beforeAll, describe, expect, it } from "vitest";
import { cnpjWithDigits } from "@/lib/cnpj";
import { adminClient, batch, createUser, done, ok, rows, userClient, type Client } from "./helpers";

// Regra por parceiro ou por cliente, com vigências (decisão 23, 10/11/2026).
// - Regra do parceiro: vale para os meses a partir da vigência e só para indicações feitas a partir
//   daquele mês; indicações anteriores seguem a regra anterior. Indicação anterior a qualquer
//   vigência usa a primeira que passou a valer.
// - Vigência própria da indicação (valor e/ou prazo): vale por mês, como a do parceiro, e manda
//   sobre a regra do parceiro. Só o diretor cria; só a mais recente muda; mês fechado trava.

let admin: Client;
let director: Client;
let noProfile: Client;
let partner: Client;
let partnerId: string;
let otherPartnerId: string;
let plainId: string;
let customId: string;
let termId: string;
let earlyId: string;
let lateId: string;

const PLAIN = cnpjWithDigits("778889990001");
const CUSTOM = cnpjWithDigits("889990001001");
const TERM = cnpjWithDigits("990001112001");
const OWN = cnpjWithDigits("101112131001");
const EARLY = cnpjWithDigits("121314151001");
const LATE = cnpjWithDigits("131415161001");
const ALL = [PLAIN, CUSTOM, TERM, OWN, EARLY, LATE];
const AUG = "2098-08-01";
const SEP = "2098-09-01";
const OCT = "2098-10-01";

async function months(referralId: string) {
  return ok(
    await director
      .from("referral_month_lives")
      .select("competency, lives, value_per_life, term_months, amount")
      .eq("referral_id", referralId)
      .order("competency"),
    "referral_month_lives",
  );
}

async function values(referralId: string): Promise<number[]> {
  return (await months(referralId)).map((row) => row.value_per_life ?? 0);
}

type RuleFields = { value_per_life: string; valid_from: string; term_months: string; id?: string };

async function saveOwnRule(referralId: string, fields: RuleFields, partner = partnerId) {
  return director.rpc("save_partner_rule", {
    payload: { partner_id: partner, referral_id: referralId, ...fields },
  });
}

async function ownRules(referralId: string) {
  return ok(
    await director
      .from("partner_rules")
      .select("id, value_per_life, valid_from, term_months")
      .eq("referral_id", referralId)
      .order("valid_from"),
    "own rules",
  );
}

async function createReferral(cnpj: string, extra: Record<string, string> = {}): Promise<string> {
  return ok(
    await director.rpc("create_referral", {
      payload: { partner_id: partnerId, cnpj, company_name: `Empresa ${cnpj}`, ...extra },
    }),
    `referral ${cnpj}`,
  );
}

beforeAll(async () => {
  admin = adminClient();
  director = await userClient((await createUser(admin, "director")).email);
  noProfile = await userClient((await createUser(admin, null)).email);
  await admin.from("monthly_lives").delete().in("cnpj", ALL);
  await admin.from("referrals").delete().in("cnpj", ALL);
  await admin.from("companies").delete().in("cnpj", ALL);
  partnerId = ok(
    await director.rpc("save_partner", {
      payload: { name: `Unidade Configuração ${Date.now()}`, kind: "unit" },
    }),
    "save_partner",
  );
  otherPartnerId = ok(
    await director.rpc("save_partner", {
      payload: { name: `Unidade Outra ${Date.now()}`, kind: "unit" },
    }),
    "other partner",
  );
  ok(
    await director.rpc("save_partner_rule", {
      payload: { partner_id: partnerId, value_per_life: "1.50", valid_from: AUG, term_months: "" },
    }),
    "rule",
  );
  partner = await userClient((await createUser(admin, "partner", partnerId)).email);
  plainId = await createReferral(PLAIN);
  // Valor e prazo informados no registro viram a primeira vigência própria da indicação.
  customId = await createReferral(CUSTOM, { value_per_life: "2.50", term_months: "2" });
  termId = await createReferral(TERM);
  earlyId = await createReferral(EARLY);
  lateId = await createReferral(LATE);
  for (const month of [AUG, SEP, OCT]) {
    ok(
      await director.rpc("import_lives", {
        batch: batch(`config-${month}.xlsx`, month),
        rows: rows([PLAIN, CUSTOM, TERM, EARLY, LATE].map((cnpj) => [cnpj, month, 10])),
      }),
      `import ${month}`,
    );
  }
});

describe("vigências da indicação", () => {
  it("sem vigência própria usa a regra do parceiro; a informada no registro vale desde já", async () => {
    expect(await months(plainId)).toEqual([
      { competency: AUG, lives: 10, value_per_life: 1.5, term_months: null, amount: 15 },
      { competency: SEP, lives: 10, value_per_life: 1.5, term_months: null, amount: 15 },
      { competency: OCT, lives: 10, value_per_life: 1.5, term_months: null, amount: 15 },
    ]);
    // Prazo de 2 meses a partir do primeiro mês pago (agosto): conta agosto e setembro.
    expect(await months(customId)).toEqual([
      { competency: AUG, lives: 10, value_per_life: 2.5, term_months: 2, amount: 25 },
      { competency: SEP, lives: 10, value_per_life: 2.5, term_months: 2, amount: 25 },
    ]);
    const own = await ownRules(customId);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ value_per_life: 2.5, term_months: 2 });
    const amounts = ok(
      await director
        .from("partner_month_amounts")
        .select("competency, lives, value_per_life, amount")
        .eq("partner_id", partnerId)
        .order("competency"),
      "partner_month_amounts",
    );
    expect(amounts).toEqual([
      { competency: AUG, lives: 50, value_per_life: 1.5, amount: 85 },
      { competency: SEP, lives: 50, value_per_life: 1.5, amount: 85 },
      { competency: OCT, lives: 40, value_per_life: 1.5, amount: 60 },
    ]);
  });

  it("vigência própria por mês: criar, editar a mais recente e remover; o cálculo acompanha", async () => {
    const september = ok(
      await saveOwnRule(plainId, { value_per_life: "3.00", valid_from: SEP, term_months: "" }),
      "own rule september",
    );
    expect(await values(plainId)).toEqual([1.5, 3, 3]);
    ok(
      await saveOwnRule(plainId, {
        id: september,
        value_per_life: "3.50",
        valid_from: SEP,
        term_months: "",
      }),
      "edit latest",
    );
    expect(await values(plainId)).toEqual([1.5, 3.5, 3.5]);
    done(await director.rpc("delete_partner_rule", { target: september }), "delete own rule");
    expect(await values(plainId)).toEqual([1.5, 1.5, 1.5]);
    expect(await ownRules(plainId)).toEqual([]);
  });

  it("só a vigência própria mais recente muda; duplicada e fora de ordem são recusadas", async () => {
    const september = ok(
      await saveOwnRule(plainId, { value_per_life: "3.00", valid_from: SEP, term_months: "" }),
      "september",
    );
    const october = ok(
      await saveOwnRule(plainId, { value_per_life: "4.00", valid_from: OCT, term_months: "" }),
      "october",
    );
    expect(await values(plainId)).toEqual([1.5, 3, 4]);
    const editOld = await saveOwnRule(plainId, {
      id: september,
      value_per_life: "3.10",
      valid_from: SEP,
      term_months: "",
    });
    expect(editOld.error?.details).toBe(
      "Só a vigência mais recente pode ser alterada. Para mudar o valor, crie uma vigência nova.",
    );
    const removeOld = await director.rpc("delete_partner_rule", { target: september });
    expect(removeOld.error?.details).toBe("Só a vigência mais recente pode ser removida.");
    const duplicate = await saveOwnRule(plainId, {
      value_per_life: "5.00",
      valid_from: OCT,
      term_months: "",
    });
    expect(duplicate.error?.message).toBe("RULE_DUPLICATE");
    const beforeOld = await saveOwnRule(plainId, {
      id: october,
      value_per_life: "4.00",
      valid_from: AUG,
      term_months: "",
    });
    expect(beforeOld.error?.details).toBe(
      "A vigência mais recente precisa começar depois das anteriores.",
    );
    done(await director.rpc("delete_partner_rule", { target: october }), "delete october");
    done(await director.rpc("delete_partner_rule", { target: september }), "delete september");
    expect(await values(plainId)).toEqual([1.5, 1.5, 1.5]);
  });

  it("vigência só de prazo usa o valor do parceiro", async () => {
    ok(
      await saveOwnRule(termId, { value_per_life: "", valid_from: AUG, term_months: "1" }),
      "term only",
    );
    expect(await months(termId)).toEqual([
      { competency: AUG, lives: 10, value_per_life: 1.5, term_months: 1, amount: 15 },
    ]);
  });

  it("valores inválidos e indicação de outro parceiro são recusados com explicação", async () => {
    const zero = await saveOwnRule(plainId, {
      value_per_life: "0",
      valid_from: SEP,
      term_months: "",
    });
    expect(zero.error?.details).toBe("O valor por vida deve ser maior que zero.");
    const longTerm = await saveOwnRule(plainId, {
      value_per_life: "",
      valid_from: SEP,
      term_months: "200",
    });
    expect(longTerm.error?.details).toBe("O prazo deve ficar entre 1 e 120 meses, ou em branco.");
    const empty = await saveOwnRule(plainId, {
      value_per_life: "",
      valid_from: SEP,
      term_months: "",
    });
    expect(empty.error?.details).toBe("Informe o valor por vida ou o prazo da indicação.");
    const foreign = await saveOwnRule(
      plainId,
      { value_per_life: "2.00", valid_from: SEP, term_months: "" },
      otherPartnerId,
    );
    expect(foreign.error?.details).toBe("A indicação não é deste parceiro.");
  });

  it("só o diretor cria vigências; o parceiro lê as das próprias indicações e não registra com valor", async () => {
    const byPartner = await partner.rpc("save_partner_rule", {
      payload: {
        partner_id: partnerId,
        referral_id: customId,
        value_per_life: "9.00",
        valid_from: OCT,
        term_months: "",
      },
    });
    expect(byPartner.error?.code).toBe("42501");
    const byNoProfile = await noProfile.rpc("save_partner_rule", {
      payload: {
        partner_id: partnerId,
        referral_id: customId,
        value_per_life: "9.00",
        valid_from: OCT,
        term_months: "",
      },
    });
    expect(byNoProfile.error?.code).toBe("42501");
    const ownWithConfig = await partner.rpc("create_referral", {
      payload: { cnpj: OWN, company_name: "Própria", value_per_life: "5.00" },
    });
    expect(ownWithConfig.error?.details).toBe(
      "Valor e prazo da indicação são definidos pela Fortes Pay.",
    );
    ok(
      await partner.rpc("create_referral", { payload: { cnpj: OWN, company_name: "Própria" } }),
      "own referral",
    );
    const mine = ok(
      await partner
        .from("partner_rules")
        .select("referral_id, value_per_life, term_months")
        .eq("referral_id", customId),
      "own rules as partner",
    );
    expect(mine).toEqual([{ referral_id: customId, value_per_life: 2.5, term_months: 2 }]);
  });
});

describe("vigências do parceiro", () => {
  it("só a mais recente é editada ou removida; parceiro ativo não fica sem regra; indicação anterior não muda", async () => {
    const october = ok(
      await director.rpc("save_partner_rule", {
        payload: {
          partner_id: partnerId,
          value_per_life: "1.80",
          valid_from: OCT,
          term_months: "",
        },
      }),
      "october rule",
    );
    const august = ok(
      await director
        .from("partner_rules")
        .select("id")
        .eq("partner_id", partnerId)
        .is("referral_id", null)
        .eq("valid_from", AUG)
        .single(),
      "august rule",
    );
    const editOld = await director.rpc("save_partner_rule", {
      payload: {
        id: august.id,
        partner_id: partnerId,
        value_per_life: "1.60",
        valid_from: AUG,
        term_months: "",
      },
    });
    expect(editOld.error?.details).toBe(
      "Só a vigência mais recente pode ser alterada. Para mudar o valor, crie uma vigência nova.",
    );
    const removeOld = await director.rpc("delete_partner_rule", { target: august.id });
    expect(removeOld.error?.details).toBe("Só a vigência mais recente pode ser removida.");
    ok(
      await director.rpc("save_partner_rule", {
        payload: {
          id: october,
          partner_id: partnerId,
          value_per_life: "1.90",
          valid_from: OCT,
          term_months: "",
        },
      }),
      "edit latest",
    );
    // A indicação foi feita antes da vigência de outubro: segue a regra anterior em outubro.
    expect(await values(plainId)).toEqual([1.5, 1.5, 1.5]);
    done(await director.rpc("delete_partner_rule", { target: october }), "delete latest");
    const lastOne = await director.rpc("delete_partner_rule", { target: august.id });
    expect(lastOne.error?.details).toBe("Parceiro ativo precisa de pelo menos uma vigência.");
  });

  it("a vigência nova vale para quem foi indicado a partir dela; indicações anteriores seguem a anterior", async () => {
    // EARLY indicada em agosto, LATE em setembro (datas ajustadas direto no banco para o teste).
    done(
      await admin
        .from("referrals")
        .update({ created_at: "2098-08-15T12:00:00Z" })
        .eq("id", earlyId),
      "backdate early",
    );
    done(
      await admin.from("referrals").update({ created_at: "2098-09-10T12:00:00Z" }).eq("id", lateId),
      "backdate late",
    );
    const september = ok(
      await director.rpc("save_partner_rule", {
        payload: {
          partner_id: partnerId,
          value_per_life: "1.80",
          valid_from: SEP,
          term_months: "",
        },
      }),
      "september rule",
    );
    expect(await values(earlyId)).toEqual([1.5, 1.5, 1.5]);
    expect(await values(lateId)).toEqual([1.5, 1.8, 1.8]);
    // Indicação anterior a qualquer vigência (PLAIN, feita hoje, antes de 2098) usa a primeira.
    expect(await values(plainId)).toEqual([1.5, 1.5, 1.5]);
    const amounts = ok(
      await director
        .from("partner_month_amounts")
        .select("competency, value_per_life, amount")
        .eq("partner_id", partnerId)
        .eq("competency", SEP)
        .single(),
      "september amounts",
    );
    // Valor por vida do parceiro no mês = regra para indicações novas; o valor soma cada indicação.
    // PLAIN 15 + CUSTOM 25 + EARLY 15 + LATE 18 (TERM só conta agosto, prazo de 1 mês).
    expect(amounts).toEqual({ competency: SEP, value_per_life: 1.8, amount: 73 });
    done(await director.rpc("delete_partner_rule", { target: september }), "delete september");
  });
});
