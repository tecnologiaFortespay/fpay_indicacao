import "server-only";
import { z } from "zod";
import { getClosing } from "@/lib/closings/queries";
import { addMonths, competencyToDate, completesMonth, dateToCompetency } from "@/lib/competency";
import type { ReferralStatus } from "@/lib/labels";
import { termLabel } from "@/lib/referrals/config";
import { createClient } from "@/lib/supabase/server";
import { AI_MODEL, AiError, askClaude, reviewSchema, type AiAlert, type AiReview } from "./claude";
import {
  CLOSING_TASK,
  closingMaterial,
  IMPORT_TASK,
  importMaterial,
  type ClosingReferralFact,
  type PreviousClosingFact,
  type SheetCompany,
} from "./material";

// Análise "em andamento" há mais tempo que isto não vai terminar (ex.: servidor reiniciou).
const STALE_AFTER_MS = 5 * 60 * 1000;

export type AiSubject = { batch_id: string } | { closing_id: string };

export type StoredReview = {
  id: string;
  status: "running" | "done" | "failed";
  summary: string | null;
  alerts: AiAlert[];
  error: string | null;
  created_at: string;
};

const alertsSchema = reviewSchema.shape.alertas;

export async function latestReview(subject: AiSubject): Promise<StoredReview | null> {
  const supabase = await createClient();
  const query = supabase
    .from("ai_reviews")
    .select("id, status, summary, alerts, error, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const { data, error } = await (
    "batch_id" in subject
      ? query.eq("batch_id", subject.batch_id)
      : query.eq("closing_id", subject.closing_id)
  ).maybeSingle();
  // Falha ao consultar não derruba a página: o painel mostra o aviso e deixa pedir de novo.
  if (error) {
    console.error("Não foi possível consultar a análise da IA:", error.message);
    return {
      id: "",
      status: "failed",
      summary: null,
      alerts: [],
      error: "Não foi possível consultar a análise da IA agora. Recarregue a página em instantes.",
      created_at: new Date().toISOString(),
    };
  }
  if (!data) {
    return null;
  }
  const alerts = alertsSchema.safeParse(data.alerts);
  const stale =
    data.status === "running" && Date.now() - Date.parse(data.created_at) > STALE_AFTER_MS;
  return {
    id: data.id,
    status: stale ? "failed" : (data.status as StoredReview["status"]),
    summary: data.summary,
    alerts: alerts.success ? alerts.data : [],
    error: stale ? "A análise não terminou. Peça de novo." : data.error,
    created_at: data.created_at,
  };
}

export async function startReview(subject: AiSubject): Promise<string> {
  const supabase = await createClient();
  const result = await supabase.rpc("start_ai_review", { subject });
  if (result.error) {
    throw result.error;
  }
  return result.data;
}

async function finishReview(reviewId: string, outcome: AiReview | Error): Promise<void> {
  const payload =
    outcome instanceof Error
      ? {
          status: "failed",
          error:
            outcome instanceof AiError ? outcome.message : "Falha inesperada na análise da IA.",
        }
      : { status: "done", summary: outcome.resumo, alerts: outcome.alertas, model: AI_MODEL };
  if (outcome instanceof Error && !(outcome instanceof AiError)) {
    console.error("Falha na análise da IA:", outcome);
  }
  const supabase = await createClient();
  const result = await supabase.rpc("finish_ai_review", { review: reviewId, payload });
  if (result.error) {
    console.error("Não foi possível gravar a análise da IA:", result.error.message);
  }
}

export async function livesByCnpj(competency: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_lives")
    .select("cnpj, lives")
    .eq("competency", competencyToDate(competency));
  if (error) {
    throw new Error("Não foi possível consultar as vidas do mês.");
  }
  return new Map(data.map((row) => [row.cnpj, row.lives]));
}

const referralRowSchema = z.object({
  id: z.uuid(),
  cnpj: z.string(),
  company_name: z.string(),
  status: z.string(),
  activated_competency: z.string().nullable(),
  partners: z.object({ name: z.string() }).nullable(),
});

// O prazo vem da view do mês (vigência própria ou do parceiro, decisão 23), não da indicação.
async function referralRows() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referrals")
    .select("id, cnpj, company_name, status, activated_competency, partners(name)");
  if (error) {
    throw new Error("Não foi possível consultar as indicações.");
  }
  return z
    .array(referralRowSchema)
    .parse(data)
    .map((row) => ({
      ...row,
      status: row.status as ReferralStatus,
      partner_name: row.partners?.name ?? "—",
    }));
}

export type ImportReviewExtras = {
  livesBeforeUpload: Map<string, number> | null;
  sheet: SheetCompany[] | null;
};

// Roda depois da resposta do envio (after()): a sessão é a do diretor que enviou ou pediu.
export async function runImportReview(
  reviewId: string,
  batchId: string,
  extras: ImportReviewExtras,
): Promise<void> {
  try {
    const supabase = await createClient();
    const batch = await supabase
      .from("import_batches")
      .select("file_name, competencies, created_at")
      .eq("id", batchId)
      .single();
    if (batch.error) {
      throw new AiError("Envio não encontrado.");
    }
    const month = batch.data.competencies.at(-1);
    if (!month) {
      throw new AiError("Este envio não tem mês para analisar.");
    }
    const competency = dateToCompetency(month);
    const [referrals, livesNow, livesPreviousMonth] = await Promise.all([
      referralRows(),
      livesByCnpj(competency),
      livesByCnpj(addMonths(competency, -1)),
    ]);
    const material = importMaterial({
      competency,
      partial: !completesMonth(batch.data.created_at, competency),
      fileName: batch.data.file_name,
      referrals,
      livesNow,
      livesPreviousMonth,
      livesBeforeUpload: extras.livesBeforeUpload,
      sheet: extras.sheet,
    });
    await finishReview(reviewId, await askClaude(IMPORT_TASK, material));
  } catch (error) {
    await finishReview(reviewId, error instanceof Error ? error : new Error(String(error)));
  }
}

async function referralMonthRows(competency: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referral_month_lives")
    .select("referral_id, lives, value_per_life, term_months")
    .eq("competency", competencyToDate(competency));
  if (error) {
    throw new Error("Não foi possível consultar as vidas das indicações.");
  }
  return new Map(data.map((row) => [row.referral_id, row]));
}

export async function runClosingReview(reviewId: string, competency: string): Promise<void> {
  try {
    const previousCompetency = addMonths(competency, -1);
    const [detail, previousDetail, referrals, monthRows, previousRows] = await Promise.all([
      getClosing(competency),
      getClosing(previousCompetency),
      referralRows(),
      referralMonthRows(competency),
      referralMonthRows(previousCompetency),
    ]);
    if (!detail) {
      throw new AiError("Prepare o cálculo do mês antes de pedir a revisão.");
    }
    const previous = new Map<string, PreviousClosingFact>(
      (previousDetail?.items ?? []).map((item) => [
        item.partner_name,
        {
          lives: item.lives,
          month_amount: Number(item.month_amount),
          total: Number(item.total),
          decision: item.decision,
        },
      ]),
    );
    const referralFacts: ClosingReferralFact[] = referrals.map((referral) => {
      const month = monthRows.get(referral.id);
      return {
        ...referral,
        lives: month?.lives ?? 0,
        lives_previous_month: previousRows.get(referral.id)?.lives ?? 0,
        value_per_life: month?.value_per_life ?? null,
        term: termLabel(month?.term_months ?? null, referral.activated_competency),
      };
    });
    const material = closingMaterial({
      competency,
      items: detail.items.map((item) => ({
        partner_name: item.partner_name,
        lives: item.lives,
        value_per_life: item.value_per_life === null ? null : Number(item.value_per_life),
        month_amount: Number(item.month_amount),
        adjustment: Number(item.adjustment),
        adjustment_note: item.adjustment_note,
        previous_balance: Number(item.previous_balance),
        total: Number(item.total),
      })),
      previous,
      referrals: referralFacts,
    });
    await finishReview(reviewId, await askClaude(CLOSING_TASK, material));
  } catch (error) {
    await finishReview(reviewId, error instanceof Error ? error : new Error(String(error)));
  }
}
