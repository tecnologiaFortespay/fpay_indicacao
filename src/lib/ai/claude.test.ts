import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AI_MODEL, AiError, askClaude } from "./claude";

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

// Cliente da Anthropic com fetch imitado: devolve `reply` e guarda o pedido.
function fakeClient(reply: { status: number; body: unknown }, captured: Captured[]) {
  return new Anthropic({
    apiKey: "chave-de-teste",
    maxRetries: 0,
    fetch: async (url, init) => {
      captured.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      });
    },
  });
}

function message(text: string, stopReason = "end_turn") {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: AI_MODEL,
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

const review = {
  resumo: "Tudo certo.",
  alertas: [
    { gravidade: "media", titulo: "Queda", detalhe: "Caiu.", parceiro: "Natal", empresa: null },
  ],
};

describe("askClaude", () => {
  it("pede o resumo no schema, com reserva em caso de recusa, e devolve o resultado", async () => {
    const captured: Captured[] = [];
    const client = fakeClient({ status: 200, body: message(JSON.stringify(review)) }, captured);
    expect(await askClaude("Tarefa: teste.", { mes: "outubro" }, client)).toEqual(review);
    const [request] = captured;
    expect(request.url).toContain("/v1/messages");
    expect(request.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(request.body).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema" } },
      messages: [{ role: "user", content: JSON.stringify({ mes: "outubro" }) }],
    });
    expect(String(request.body.system)).toContain("Tarefa: teste.");
  });

  it("recusa vira mensagem em português", async () => {
    const client = fakeClient({ status: 200, body: message("", "refusal") }, []);
    await expect(askClaude("Tarefa.", {}, client)).rejects.toThrow(
      new AiError("A IA recusou esta análise."),
    );
  });

  it("chave recusada vira mensagem para quem configura o servidor", async () => {
    const client = fakeClient(
      {
        status: 401,
        body: { type: "error", error: { type: "authentication_error", message: "invalid" } },
      },
      [],
    );
    await expect(askClaude("Tarefa.", {}, client)).rejects.toThrow(
      "Chave da IA recusada: confira ANTHROPIC_API_KEY no servidor.",
    );
  });
});
