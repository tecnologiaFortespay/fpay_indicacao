import { beforeAll, describe, expect, it } from "vitest";
import { cnpjWithDigits } from "@/lib/cnpj";
import { adminClient, batch, createUser, done, ok, rows, userClient, type Client } from "./helpers";

// Configuração da indicação (decisão de 28/10/2026): valor por vida e prazo próprios, definidos pelo
// diretor; em branco vale a regra do parceiro. E vigências: só a mais recente muda.

let admin: Client;
let director: Client;
let noProfile: Client;
let partner: Client;
let partnerId: string;
let plainId: string;
let customId: string;

const PLAIN = cnpjWithDigits("778889990001");
const CUSTOM = cnpjWithDigits("889990001001");
const OWN = cnpjWithDigits("990001112001");
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

beforeAll(async () => {
  admin = adminClient();
  director = await userClient((await createUser(admin, "director")).email);
  noProfile = await userClient((await createUser(admin, null)).email);
  await admin.from("referrals").delete().in("cnpj", [PLAIN, CUSTOM, OWN]);
  await admin.from("companies").delete().in("cnpj", [PLAIN, CUSTOM, OWN]);
  partnerId = ok(
    await director.rpc("save_partner", {
      payload: { name: `Unidade Configuração ${Date.now()}`, kind: "unit" },
    }),
    "save_partner",
  );
  ok(
    await director.rpc("save_partner_rule", {
      payload: { partner_id: partnerId, value_per_life: "1.50", valid_from: AUG, term_months: "" },
    }),
    "rule",
  );
  partner = await userClient((await createUser(admin, "partner", partnerId)).email);
  plainId = ok(
    await director.rpc("create_referral", {
      payload: { partner_id: partnerId, cnpj: PLAIN, company_name: "Sem configuração" },
    }),
    "plain referral",
  );
  customId = ok(
    await director.rpc("create_referral", {
      payload: {
        partner_id: partnerId,
        cnpj: CUSTOM,
        company_name: "Com configuração",
        value_per_life: "2.50",
        term_months: "2",
      },
    }),
    "custom referral",
  );
  for (const month of [AUG, SEP, OCT]) {
    ok(
      await director.rpc("import_lives", {
        batch: batch(`config-${month}.xlsx`, month),
        rows: rows([
          [PLAIN, month, 10],
          [CUSTOM, month, 10],
        ]),
      }),
      `import ${month}`,
    );
  }
});

describe("configuração da indicação", () => {
  it("indicação sem configuração usa a regra do parceiro; com configuração, o valor e o prazo dela", async () => {
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
    const amounts = ok(
      await director
        .from("partner_month_amounts")
        .select("competency, lives, value_per_life, amount")
        .eq("partner_id", partnerId)
        .order("competency"),
      "partner_month_amounts",
    );
    expect(amounts).toEqual([
      { competency: AUG, lives: 20, value_per_life: 1.5, amount: 40 },
      { competency: SEP, lives: 20, value_per_life: 1.5, amount: 40 },
      { competency: OCT, lives: 10, value_per_life: 1.5, amount: 15 },
    ]);
  });

  it("o diretor muda e limpa a configuração; o cálculo acompanha", async () => {
    done(
      await director.rpc("set_referral_config", {
        target: plainId,
        payload: { value_per_life: "3.00", term_months: "" },
      }),
      "set config",
    );
    expect((await months(plainId)).map((row) => row.amount)).toEqual([30, 30, 30]);
    done(
      await director.rpc("set_referral_config", {
        target: plainId,
        payload: { value_per_life: "", term_months: "1" },
      }),
      "term only",
    );
    expect(await months(plainId)).toEqual([
      { competency: AUG, lives: 10, value_per_life: 1.5, term_months: 1, amount: 15 },
    ]);
    done(
      await director.rpc("set_referral_config", {
        target: plainId,
        payload: { value_per_life: "", term_months: "" },
      }),
      "clear",
    );
    expect(await months(plainId)).toHaveLength(3);
  });

  it("valores inválidos são recusados com explicação", async () => {
    const zero = await director.rpc("set_referral_config", {
      target: plainId,
      payload: { value_per_life: "0", term_months: "" },
    });
    expect(zero.error?.details).toBe(
      "Valor por vida inválido (ex.: 1,50); em branco usa o do parceiro.",
    );
    const longTerm = await director.rpc("set_referral_config", {
      target: plainId,
      payload: { value_per_life: "", term_months: "200" },
    });
    expect(longTerm.error?.details).toBe("Prazo entre 1 e 120 meses; em branco usa o do parceiro.");
  });

  it("só o diretor configura: parceiro e conta sem perfil são recusados", async () => {
    const byPartner = await partner.rpc("set_referral_config", {
      target: customId,
      payload: { value_per_life: "9.00", term_months: "" },
    });
    expect(byPartner.error?.code).toBe("42501");
    const byNoProfile = await noProfile.rpc("set_referral_config", {
      target: customId,
      payload: { value_per_life: "9.00", term_months: "" },
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
    // O parceiro lê o valor e o prazo das próprias indicações.
    const own = ok(
      await partner
        .from("referrals")
        .select("cnpj, value_per_life, term_months")
        .eq("cnpj", CUSTOM)
        .single(),
      "own custom",
    );
    expect(own).toEqual({ cnpj: CUSTOM, value_per_life: 2.5, term_months: 2 });
  });
});

describe("vigências do parceiro", () => {
  it("só a mais recente é editada ou removida, e o parceiro ativo nunca fica sem regra", async () => {
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
    const beforeOld = await director.rpc("save_partner_rule", {
      payload: {
        id: october,
        partner_id: partnerId,
        value_per_life: "1.80",
        valid_from: AUG,
        term_months: "",
      },
    });
    expect(beforeOld.error?.details).toBe(
      "A vigência mais recente precisa começar depois das anteriores.",
    );
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
    expect((await months(plainId)).map((row) => row.value_per_life)).toEqual([1.5, 1.5, 1.9]);
    done(await director.rpc("delete_partner_rule", { target: october }), "delete latest");
    const lastOne = await director.rpc("delete_partner_rule", { target: august.id });
    expect(lastOne.error?.details).toBe("Parceiro ativo precisa de pelo menos uma vigência.");
  });
});
