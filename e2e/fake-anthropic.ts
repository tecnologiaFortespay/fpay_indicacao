// Imitação mínima da API da Anthropic para os testes de ponta a ponta: responde POST /v1/messages
// com um resumo fixo no formato do schema da análise e guarda cada pedido para conferência.
// GET /__requests devolve os pedidos recebidos; POST /__reset limpa a lista.
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";

export const FAKE_ANTHROPIC_PORT = Number(process.env.FAKE_ANTHROPIC_PORT ?? 3199);

export type RecordedRequest = { headers: IncomingHttpHeaders; body: Record<string, unknown> };

export const FAKE_IMPORT_SUMMARY = "Resumo de teste: o envio tem uma indicação a conferir.";
export const FAKE_CLOSING_SUMMARY = "Resumo de teste: nada fora do esperado neste cálculo.";

function review(system: string) {
  if (system.includes("Tarefa: revisar o cálculo")) {
    return { resumo: FAKE_CLOSING_SUMMARY, alertas: [] };
  }
  return {
    resumo: FAKE_IMPORT_SUMMARY,
    alertas: [
      {
        gravidade: "alta",
        titulo: "CNPJ da indicação pode estar errado",
        detalhe: "A empresa indicada não veio no arquivo, mas há uma empresa de nome igual.",
        parceiro: "Unidade IA",
        empresa: "Padaria Pão Quente",
      },
    ],
  };
}

export function startFakeAnthropic(): Promise<Server> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      if (request.method === "GET" && request.url === "/__requests") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(requests));
        return;
      }
      if (request.method === "POST" && request.url === "/__reset") {
        requests.length = 0;
        response.writeHead(204).end();
        return;
      }
      if (request.method === "POST" && request.url?.startsWith("/v1/messages")) {
        const body = JSON.parse(raw) as Record<string, unknown>;
        requests.push({ headers: request.headers, body });
        const system = typeof body.system === "string" ? body.system : JSON.stringify(body.system);
        // Um pouco de demora, para a tela mostrar "analisando" antes do resultado.
        setTimeout(() => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              id: `msg_teste_${requests.length}`,
              type: "message",
              role: "assistant",
              model: body.model,
              content: [{ type: "text", text: JSON.stringify(review(system)) }],
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 100, output_tokens: 50 },
            }),
          );
        }, 1500);
        return;
      }
      response.writeHead(404).end();
    });
  });
  return new Promise((resolve) => {
    server.listen(FAKE_ANTHROPIC_PORT, "127.0.0.1", () => resolve(server));
  });
}

export async function fakeRequests(): Promise<RecordedRequest[]> {
  const response = await fetch(`http://127.0.0.1:${FAKE_ANTHROPIC_PORT}/__requests`);
  return (await response.json()) as RecordedRequest[];
}

export async function resetFakeRequests(): Promise<void> {
  await fetch(`http://127.0.0.1:${FAKE_ANTHROPIC_PORT}/__reset`, { method: "POST" });
}
