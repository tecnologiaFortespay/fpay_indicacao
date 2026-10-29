import { beforeAll, describe, expect, it } from "vitest";
import { cnpjWithDigits } from "@/lib/cnpj";
import { adminClient, batch, createUser, done, ok, rows, userClient, type Client } from "./helpers";

let admin: Client;
let director: Client;
let natal: Client;
let manaus: Client;
let natalId: string;
let manausId: string;
let natalItemId: string;
let manausItemId: string;

const CNPJ_P = cnpjWithDigits("667778880001");
const CNPJ_Q = cnpjWithDigits("778889990001");
const APRIL = "2026-04-01";

async function activePartner(name: string): Promise<string> {
  return ok(
    await admin
      .from("partners")
      .insert({ name, kind: "unit", status: "active" })
      .select("id")
      .single(),
    "partner",
  ).id;
}

beforeAll(async () => {
  admin = adminClient();
  director = await userClient((await createUser(admin, "director")).email);
  await admin.from("monthly_lives").delete().in("cnpj", [CNPJ_P, CNPJ_Q]);
  await admin.from("referrals").delete().in("cnpj", [CNPJ_P, CNPJ_Q]);
  await admin.from("companies").delete().in("cnpj", [CNPJ_P, CNPJ_Q]);
  natalId = await activePartner(`Natal painel ${Date.now()}`);
  manausId = await activePartner(`Manaus painel ${Date.now()}`);
  natal = await userClient((await createUser(admin, "partner", natalId)).email);
  manaus = await userClient((await createUser(admin, "partner", manausId)).email);
  for (const [partnerId, cnpj] of [
    [natalId, CNPJ_P],
    [manausId, CNPJ_Q],
  ] as const) {
    ok(
      await director.rpc("save_partner_rule", {
        payload: {
          partner_id: partnerId,
          value_per_life: "1.50",
          valid_from: "2026-01-01",
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
      batch: batch("abril.csv"),
      rows: rows([
        [CNPJ_P, APRIL, 20],
        [CNPJ_Q, APRIL, 10],
      ]),
    }),
    "import",
  );
  ok(await director.rpc("prepare_closing", { month: APRIL }), "prepare");
  const closing = ok(
    await director.from("closings").select("id").eq("competency", APRIL).single(),
    "closing",
  );
  natalItemId = ok(
    await director
      .from("closing_items")
      .select("id")
      .eq("closing_id", closing.id)
      .eq("partner_id", natalId)
      .single(),
    "natal item",
  ).id;
  manausItemId = ok(
    await director
      .from("closing_items")
      .select("id")
      .eq("closing_id", closing.id)
      .eq("partner_id", manausId)
      .single(),
    "manaus item",
  ).id;
});

describe("fatia 5 — painel do parceiro", () => {
  it("parceiro vê só as próprias vidas e valores; o carimbo de importação é visível", async () => {
    const amounts = ok(
      await natal.from("partner_month_amounts").select("partner_id, lives, amount"),
      "amounts as natal",
    );
    expect(amounts).toEqual([{ partner_id: natalId, lives: 20, amount: 30 }]);
    const stamp = ok(await natal.rpc("last_import_at"), "last_import_at");
    expect(typeof stamp).toBe("string");
    const batches = ok(await natal.from("import_batches").select("id"), "batches as natal");
    expect(batches).toEqual([]);
  });

  it("antes de fechar, o parceiro não vê o item nem pode responder", async () => {
    const hidden = ok(await natal.from("closing_items").select("id"), "items before close");
    expect(hidden).toEqual([]);
    const early = await natal.rpc("respond_closing_item", {
      target: natalItemId,
      response: "confirmed",
      note: "",
    });
    expect(early.error?.details).toBe("Este mês ainda não foi fechado.");
    done(
      await director.rpc("close_closing", {
        target: ok(
          await director.from("closings").select("id").eq("competency", APRIL).single(),
          "c",
        ).id,
        paid_partner_ids: [natalId],
      }),
      "close",
    );
  });

  it("depois de fechado, só o dono responde; contestar exige explicação; o diretor vê a resposta", async () => {
    const visible = ok(
      await natal.from("closing_items").select("id, total, decision"),
      "items after close",
    );
    expect(visible).toEqual([{ id: natalItemId, total: 30, decision: "pay" }]);
    const notMine = await natal.rpc("respond_closing_item", {
      target: manausItemId,
      response: "confirmed",
      note: "",
    });
    expect(notMine.error?.code).toBe("P0002");
    const noNote = await manaus.rpc("respond_closing_item", {
      target: manausItemId,
      response: "disputed",
      note: " ",
    });
    expect(noNote.error?.details).toBe("Explique o que não confere (até 400 caracteres).");
    const bad = await natal.rpc("respond_closing_item", {
      target: natalItemId,
      response: "maybe",
      note: "",
    });
    expect(bad.error?.message).toBe("CLOSING_FIELDS");
    done(
      await natal.rpc("respond_closing_item", {
        target: natalItemId,
        response: "confirmed",
        note: "",
      }),
      "confirm",
    );
    done(
      await manaus.rpc("respond_closing_item", {
        target: manausItemId,
        response: "disputed",
        note: "Faltou um cliente.",
      }),
      "dispute",
    );
    const seen = ok(
      await director
        .from("closing_items")
        .select("partner_id, partner_response, partner_note")
        .in("id", [natalItemId, manausItemId])
        .order("partner_response"),
      "director view",
    );
    expect(seen).toEqual([
      { partner_id: natalId, partner_response: "confirmed", partner_note: null },
      { partner_id: manausId, partner_response: "disputed", partner_note: "Faltou um cliente." },
    ]);
    const byDirector = await director.rpc("respond_closing_item", {
      target: natalItemId,
      response: "confirmed",
      note: "",
    });
    expect(byDirector.error?.code).toBe("42501");
  });
});
