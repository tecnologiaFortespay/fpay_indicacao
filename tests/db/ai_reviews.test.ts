import { beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  batch,
  CNPJ_A,
  createUser,
  done,
  ok,
  rows,
  userClient,
  type Client,
} from "./helpers";

let director: Client;
let noProfile: Client;
let partner: Client;
let batchId: string;

beforeAll(async () => {
  const admin = adminClient();
  const directorUser = await createUser(admin, "director");
  const noProfileUser = await createUser(admin, null);
  director = await userClient(directorUser.email);
  noProfile = await userClient(noProfileUser.email);
  const partnerRow = ok(
    await admin
      .from("partners")
      .insert({ name: `Unidade IA ${Date.now()}`, kind: "unit", status: "active" })
      .select("id")
      .single(),
    "partner",
  );
  const partnerUser = await createUser(admin, "partner", partnerRow.id);
  partner = await userClient(partnerUser.email);
  batchId = ok(
    await director.rpc("import_lives", {
      batch: batch("ia.xlsx", "2099-09-01"),
      rows: rows([[CNPJ_A, "2099-09-01", 5]]),
    }),
    "import_lives",
  );
});

describe("análises da IA: só o diretor", () => {
  it("diretor abre, grava e lê a análise de um envio", async () => {
    const reviewId = ok(
      await director.rpc("start_ai_review", { subject: { batch_id: batchId } }),
      "start_ai_review",
    );
    const twice = await director.rpc("start_ai_review", { subject: { batch_id: batchId } });
    expect(twice.error?.details).toBe("A IA já está analisando. Aguarde o resultado.");
    done(
      await director.rpc("finish_ai_review", {
        review: reviewId,
        payload: {
          status: "done",
          summary: "Resumo.",
          alerts: [{ gravidade: "alta", titulo: "T", detalhe: "D", parceiro: null, empresa: null }],
          model: "claude-opus-5-5",
        },
      }),
      "finish_ai_review",
    );
    const saved = ok(
      await director
        .from("ai_reviews")
        .select("status, summary, alerts")
        .eq("id", reviewId)
        .single(),
      "ai_reviews",
    );
    expect(saved).toMatchObject({ status: "done", summary: "Resumo." });
    const again = await director.rpc("finish_ai_review", {
      review: reviewId,
      payload: { status: "failed", error: "x" },
    });
    expect(again.error?.details).toBe("Análise não encontrada ou já concluída.");
  });

  it("conta sem perfil e parceiro não leem nem abrem análises", async () => {
    for (const client of [noProfile, partner]) {
      const read = ok(await client.from("ai_reviews").select("id"), "ai_reviews (other roles)");
      expect(read).toEqual([]);
      const start = await client.rpc("start_ai_review", { subject: { batch_id: batchId } });
      expect(start.error?.code).toBe("42501");
    }
  });

  it("análise precisa de um envio ou de um fechamento, não dos dois nem de nenhum", async () => {
    const none = await director.rpc("start_ai_review", { subject: {} });
    expect(none.error?.details).toBe("Informe o envio ou o fechamento.");
  });
});
