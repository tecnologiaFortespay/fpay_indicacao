import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Claude, chamado só pelo servidor e só em ações do diretor. A chave fica em ANTHROPIC_API_KEY no
// ambiente de execução (nunca NEXT_PUBLIC_*, nunca no navegador).
export const AI_MODEL = "claude-opus-5-5";

const MAX_ALERTS = 12;

export const reviewSchema = z.object({
  resumo: z.string(),
  alertas: z.array(
    z.object({
      gravidade: z.enum(["alta", "media", "baixa"]),
      titulo: z.string(),
      detalhe: z.string(),
      parceiro: z.string().nullable(),
      empresa: z.string().nullable(),
    }),
  ),
});

export type AiReview = z.infer<typeof reviewSchema>;
export type AiAlert = AiReview["alertas"][number];

export class AiError extends Error {}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

const SYSTEM = `Você apoia o diretor da Fortes Pay no programa de indicação. Parceiros (unidades e indicadores externos) indicam empresas clientes, identificadas pelo CNPJ. A comissão do mês é: vidas pagas no mês (coluna "C. Cash-in" do BI) × valor por vida da indicação ou, sem valor próprio, da regra do parceiro de quando a indicação foi feita (uma regra nova do parceiro vale só para indicações feitas a partir dela).

O sistema já calculou todos os números. Não recalcule nem invente valores: use só os do material. Seu papel é apontar ao diretor o que merece atenção e explicar por quê, em português do Brasil, com frases curtas e sem jargão técnico.

Gravidade: "alta" quando pode levar a pagar errado ou a perder comissão; "media" quando pede conferência; "baixa" quando é só informativo. Devolva no máximo 8 alertas, os mais importantes primeiro, e cite parceiro e empresa quando o alerta for sobre eles (senão, null). O resumo tem de duas a quatro frases. Se nada merecer atenção, diga isso no resumo e devolva a lista vazia.`;

// Uma análise: instruções da tarefa + material em JSON → resumo e alertas validados pelo schema.
export async function askClaude(
  task: string,
  material: unknown,
  client: Anthropic = new Anthropic({ timeout: 180_000, maxRetries: 1 }),
): Promise<AiReview> {
  try {
    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      // Se o modelo recusar por política, a API refaz a chamada num modelo de reserva.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(reviewSchema) },
      system: `${SYSTEM}\n\n${task}`,
      messages: [{ role: "user", content: JSON.stringify(material) }],
    });
    // O motivo da parada vem antes do conteúdo: numa recusa, não há JSON para ler.
    if (response.stop_reason === "refusal") {
      throw new AiError("A IA recusou esta análise.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiError("A análise ficou longa demais e foi cortada. Tente de novo.");
    }
    const text = response.content.find((block) => block.type === "text")?.text ?? "";
    const parsed = parseReview(text);
    if (!parsed) {
      throw new AiError("A IA não concluiu a análise. Tente de novo.");
    }
    return { resumo: parsed.resumo, alertas: parsed.alertas.slice(0, MAX_ALERTS) };
  } catch (error) {
    throw aiError(error);
  }
}

function parseReview(text: string): AiReview | null {
  try {
    const result = reviewSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function aiError(error: unknown): Error {
  if (error instanceof AiError) {
    return error;
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError("Chave da IA recusada: confira ANTHROPIC_API_KEY no servidor.");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError("A chave da IA não tem permissão para este modelo.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError("Limite de uso da IA atingido. Tente de novo em alguns minutos.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("Sem resposta da IA a tempo. Tente de novo.");
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(`A IA respondeu com erro (${error.status ?? "sem código"}). Tente de novo.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}
