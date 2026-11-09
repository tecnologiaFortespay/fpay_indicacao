import { z } from "zod";
import type { ReferralStatus } from "@/lib/labels";

// Conferência de um envio antes de gravar: o que a função SQL preview_import devolve (a importação
// rodada e desfeita) mais o que só o arquivo sabe. Ver supabase/migrations/…13_import_preview.sql.

const statusSchema = z.enum([
  "referred",
  "negotiating",
  "signed",
  "active",
  "delinquent",
  "lost",
  "cancelled",
]) satisfies z.ZodType<ReferralStatus>;

const previewSchema = z.object({
  closed: z.boolean(),
  rows_imported: z.number(),
  rows_skipped: z.number(),
  rows_ignored: z.number(),
  issues: z.array(
    z.object({
      line_number: z.number(),
      outcome: z.string(),
      reason: z.string(),
      raw_line: z.string(),
    }),
  ),
  referrals: z.array(
    z.object({
      id: z.string(),
      cnpj: z.string(),
      company_name: z.string(),
      partner_name: z.string(),
      status_before: statusSchema,
      status_after: statusSchema,
      lives_before: z.number(),
      lives_after: z.number(),
      in_file: z.boolean(),
      counts_before: z.boolean(),
      counts_after: z.boolean(),
      value_per_life: z.coerce.number().nullable(),
      amount_before: z.coerce.number(),
      amount_after: z.coerce.number(),
    }),
  ),
});

export type DatabasePreview = z.infer<typeof previewSchema>;
export type PreviewReferral = DatabasePreview["referrals"][number];

export type ImportPreview = DatabasePreview & {
  file_name: string;
  // Impressão do arquivo conferido: a confirmação só grava se for o mesmo arquivo.
  file_hash: string;
  // "YYYY-MM"
  competency: string;
  // Envio feito depois do fim do mês: completa o mês (libera o fechamento, marca inadimplentes).
  complete: boolean;
  rows_read: number;
  partners: PartnerPreview[];
};

export function parseDatabasePreview(value: unknown): DatabasePreview {
  return previewSchema.parse(value);
}

export type PartnerPreview = {
  partner_name: string;
  lives_before: number;
  lives_after: number;
  amount_before: number;
  amount_after: number;
};

// Por parceiro: soma das indicações dele na conferência.
export function partnerTotals(referrals: PreviewReferral[]): PartnerPreview[] {
  const totals = new Map<string, PartnerPreview>();
  for (const referral of referrals) {
    const total = totals.get(referral.partner_name) ?? {
      partner_name: referral.partner_name,
      lives_before: 0,
      lives_after: 0,
      amount_before: 0,
      amount_after: 0,
    };
    // Vidas de indicação que não conta no mês (perdida, cancelada, fora do prazo) não somam,
    // como na Visão geral.
    total.lives_before += referral.counts_before ? referral.lives_before : 0;
    total.lives_after += referral.counts_after ? referral.lives_after : 0;
    total.amount_before += referral.amount_before;
    total.amount_after += referral.amount_after;
    totals.set(referral.partner_name, total);
  }
  return Array.from(totals.values()).sort((a, b) => a.partner_name.localeCompare(b.partner_name));
}
