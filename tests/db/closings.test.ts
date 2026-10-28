import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cnpjWithDigits } from "@/lib/cnpj";
import { adminClient, batch, createUser, done, ok, rows, userClient, type Client } from "./helpers";

let admin: Client;
let director: Client;
let analyst: Client;
let natalId: string;
let teresinaId: string;
let natalClient: Client;

const CNPJ_N = cnpjWithDigits("445556660001");
const CNPJ_T = cnpjWithDigits("556667770001");
const AUGUST = "2026-08-01";
const SEPTEMBER = "2026-09-01";
const OCTOBER = "2026-10-01";

async function activePartner(name: string): Promise<string> {
  const partner = ok(
    await admin
      .from("partners")
      .insert({ name, kind: "unit", status: "active", payment_method: "card" })
      .select("id")
      .single(),
    "insert partner",
  );
  return partner.id;
}

async function items(competency: string) {
  const closing = ok(
    await director.from("closings").select("id, status").eq("competency", competency).single(),
    "closing",
  );
  const list = ok(
    await director
      .from("closing_items")
      .select("partner_id, lives, month_amount, adjustment, previous_balance, total, decision")
      .eq("closing_id", closing.id)
      .in("partner_id", [natalId, teresinaId]),
    "items",
  );
  const byPartner = new Map(list.map((item) => [item.partner_id, item]));
  return { closing, natal: byPartner.get(natalId), teresina: byPartner.get(teresinaId) };
}

beforeAll(async () => {
  admin = adminClient();
  const directorUser = await createUser(admin, "director");
  const analystUser = await createUser(admin, "analyst");
  director = await userClient(directorUser.email);
  analyst = await userClient(analystUser.email);
  // Estado limpo para estes meses (o banco local é compartilhado entre execuções).
  await admin.from("closings").delete().in("competency", [AUGUST, SEPTEMBER, OCTOBER]);
  await admin.from("monthly_lives").delete().in("cnpj", [CNPJ_N, CNPJ_T]);
  await admin.from("referrals").delete().in("cnpj", [CNPJ_N, CNPJ_T]);
  await admin.from("companies").delete().in("cnpj", [CNPJ_N, CNPJ_T]);
  natalId = await activePartner(`Natal fechamento ${Date.now()}`);
  teresinaId = await activePartner(`Teresina fechamento ${Date.now()}`);
  const natalUser = await createUser(admin, "partner", natalId);
  natalClient = await userClient(natalUser.email);
  for (const [partnerId, cnpj, value] of [
    [natalId, CNPJ_N, "1.50"],
    [teresinaId, CNPJ_T, "2.00"],
  ] as const) {
    ok(
      await director.rpc("save_partner_rule", {
        payload: {
          partner_id: partnerId,
          value_per_life: value,
          valid_from: "2026-07-01",
          term_months: "",
        },
      }),
      "rule",
    );
    ok(
      await director.rpc("create_referral", {
        payload: { partner_id: partnerId, cnpj, company_name: `Empresa ${cnpj}` },
      }),
      "referral",
    );
  }
  ok(
    await director.rpc("import_lives", {
      batch: batch("ago-set.csv"),
      rows: rows([
        [CNPJ_N, AUGUST, 40],
        [CNPJ_T, AUGUST, 50],
        [CNPJ_N, SEPTEMBER, 48],
        [CNPJ_T, SEPTEMBER, 50],
      ]),
    }),
    "import",
  );
});

afterAll(async () => {
  // Fechamentos fechados travam vigências de outros testes: remove os deste arquivo.
  await admin.from("closings").delete().in("competency", [AUGUST, SEPTEMBER, OCTOBER]);
});

describe("fatia 4 — fechamento mensal", () => {
  it("só fecha mês encerrado, com importação feita depois do fim do mês, em ordem", async () => {
    const current = await director.rpc("prepare_closing", { month: OCTOBER });
    expect(current.error?.details).toBe("Só é possível fechar um mês já encerrado.");
    // Importação datada de dentro do mês não libera agosto.
    const batches = ok(
      await admin
        .from("import_batches")
        .select("id, created_at")
        .contains("competencies", [AUGUST]),
      "batches",
    );
    for (const b of batches) {
      done(
        await admin
          .from("import_batches")
          .update({ created_at: "2026-08-20T12:00:00-03:00" })
          .eq("id", b.id),
        "backdate",
      );
    }
    const early = await director.rpc("prepare_closing", { month: AUGUST });
    expect(early.error?.details).toBe(
      "Ainda não há importação deste mês feita depois do fim do mês.",
    );
    for (const b of batches) {
      done(
        await admin.from("import_batches").update({ created_at: b.created_at }).eq("id", b.id),
        "restore",
      );
    }
    const analystTry = await analyst.rpc("prepare_closing", { month: AUGUST });
    expect(analystTry.error?.code).toBe("42501");
  });

  it("prepara agosto com vidas × valor e saldo anterior zero; ajuste é preservado ao recalcular", async () => {
    ok(await director.rpc("prepare_closing", { month: AUGUST }), "prepare august");
    let august = await items(AUGUST);
    expect(august.natal).toMatchObject({
      lives: 40,
      month_amount: 60,
      previous_balance: 0,
      total: 60,
      decision: null,
    });
    expect(august.teresina).toMatchObject({
      lives: 50,
      month_amount: 100,
      previous_balance: 0,
      total: 100,
    });
    const natalItem = ok(
      await director
        .from("closing_items")
        .select("id")
        .eq("closing_id", august.closing.id)
        .eq("partner_id", natalId)
        .single(),
      "natal item",
    );
    const noNote = await director.rpc("set_closing_adjustment", {
      target: natalItem.id,
      amount: -10,
      note: "",
    });
    expect(noNote.error?.details).toBe("Informe o motivo do ajuste.");
    done(
      await director.rpc("set_closing_adjustment", {
        target: natalItem.id,
        amount: -10,
        note: "Cortesia combinada.",
      }),
      "adjust",
    );
    ok(await director.rpc("prepare_closing", { month: AUGUST }), "recalculate august");
    august = await items(AUGUST);
    expect(august.natal).toMatchObject({ adjustment: -10, total: 50 });
    // Setembro não pode ser preparado com agosto aberto.
    const outOfOrder = await director.rpc("prepare_closing", { month: SEPTEMBER });
    expect(outOfOrder.error?.details).toBe("Feche primeiro o mês 08/2026.");
  });

  it("fecha agosto pagando só Teresina; Natal acumula e o mês fica imutável", async () => {
    const august = await items(AUGUST);
    const wrongPartner = await director.rpc("close_closing", {
      target: august.closing.id,
      paid_partner_ids: ["00000000-0000-0000-0000-000000000000"],
    });
    expect(wrongPartner.error?.details).toBe("Parceiro marcado não pertence a este fechamento.");
    done(
      await director.rpc("close_closing", {
        target: august.closing.id,
        paid_partner_ids: [teresinaId],
      }),
      "close august",
    );
    const closed = await items(AUGUST);
    expect(closed.closing.status).toBe("closed");
    expect(closed.natal?.decision).toBe("accumulate");
    expect(closed.teresina?.decision).toBe("pay");
    const natalItem = ok(
      await director
        .from("closing_items")
        .select("id")
        .eq("closing_id", august.closing.id)
        .eq("partner_id", natalId)
        .single(),
      "natal item",
    );
    const lateAdjustment = await director.rpc("set_closing_adjustment", {
      target: natalItem.id,
      amount: 5,
      note: "tarde",
    });
    expect(lateAdjustment.error?.details).toBe("Este mês já está fechado.");
    const again = await director.rpc("prepare_closing", { month: AUGUST });
    expect(again.error?.details).toBe("Este mês já está fechado.");
    // Importação de agosto depois do fechamento: linhas ignoradas com motivo.
    const batchId = ok(
      await director.rpc("import_lives", {
        batch: batch("agosto-tarde.csv"),
        rows: rows([
          [CNPJ_N, AUGUST, 99],
          [CNPJ_N, SEPTEMBER, 48],
          [CNPJ_T, SEPTEMBER, 50],
        ]),
      }),
      "late import",
    );
    const log = ok(
      await director.from("import_rows").select("reason, outcome").eq("batch_id", batchId),
      "log",
    );
    expect(log).toEqual([
      { reason: "Mês já fechado (08/2026); a linha não entrou.", outcome: "ignored" },
    ]);
    const augustLives = ok(
      await director
        .from("monthly_lives")
        .select("lives")
        .eq("cnpj", CNPJ_N)
        .eq("competency", AUGUST)
        .single(),
      "lives",
    );
    expect(augustLives.lives).toBe(40);
    // Vigência que alcança agosto não muda mais.
    const locked = await director.rpc("save_partner_rule", {
      payload: { partner_id: natalId, value_per_life: "9.00", valid_from: AUGUST, term_months: "" },
    });
    expect(locked.error?.message).toBe("RULE_LOCKED");
    expect(locked.error?.details).toBe("08/2026");
    ok(
      await director.rpc("save_partner_rule", {
        payload: {
          partner_id: natalId,
          value_per_life: "9.00",
          valid_from: "2026-11-01",
          term_months: "",
        },
      }),
      "future rule",
    );
  });

  it("setembro carrega o saldo de Natal; pagar Natal zera o pendente", async () => {
    ok(await director.rpc("prepare_closing", { month: SEPTEMBER }), "prepare september");
    const september = await items(SEPTEMBER);
    expect(september.natal).toMatchObject({
      lives: 48,
      month_amount: 72,
      previous_balance: 50,
      total: 122,
    });
    expect(september.teresina).toMatchObject({
      lives: 50,
      month_amount: 100,
      previous_balance: 0,
      total: 100,
    });
    done(
      await director.rpc("close_closing", {
        target: september.closing.id,
        paid_partner_ids: [natalId, teresinaId],
      }),
      "close september",
    );
    const closed = await items(SEPTEMBER);
    expect(closed.natal?.decision).toBe("pay");
    expect(closed.teresina?.decision).toBe("pay");
  });

  it("parceiro lê só os próprios itens de meses fechados; analista não lê fechamentos", async () => {
    const own = ok(
      await natalClient.from("closing_items").select("partner_id, total, decision").order("total"),
      "own items",
    );
    expect(own.every((item) => item.partner_id === natalId)).toBe(true);
    expect(own.map((item) => item.total)).toEqual([50, 122]);
    const closings = ok(
      await natalClient.from("closings").select("competency, status"),
      "closings as partner",
    );
    expect(closings.map((closing) => closing.competency).sort()).toEqual([AUGUST, SEPTEMBER]);
    const forAnalyst = ok(await analyst.from("closings").select("id"), "closings as analyst");
    expect(forAnalyst).toEqual([]);
    const denied = await natalClient.rpc("close_closing", {
      target: (await items(SEPTEMBER)).closing.id,
      paid_partner_ids: [],
    });
    expect(denied.error?.code).toBe("42501");
  });
});
