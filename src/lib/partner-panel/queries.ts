import "server-only";
import { competencyToDate, dateToCompetency } from "@/lib/competency";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type MonthSummary = { lives: number; value_per_life: string | null; amount: string };

// Vidas e valor do parceiro logado no mês (view partner_month_amounts sob a RLS dele).
export async function partnerMonthSummary(
  partnerId: string,
  competency: string,
): Promise<MonthSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_month_amounts")
    .select("lives, value_per_life, amount")
    .eq("partner_id", partnerId)
    .eq("competency", competencyToDate(competency))
    .maybeSingle();
  if (error) {
    throw new Error("Não foi possível consultar as vidas do mês.");
  }
  return {
    lives: data?.lives ?? 0,
    value_per_life:
      data?.value_per_life === null || data?.value_per_life === undefined
        ? null
        : String(data.value_per_life),
    amount: String(data?.amount ?? 0),
  };
}

export type PartnerClosingItem = Tables<"closing_items"> & {
  competency: string;
  closed_at: string | null;
};

// Itens do parceiro logado em fechamentos fechados, do mais recente ao mais antigo.
export async function partnerClosingItems(partnerId: string): Promise<PartnerClosingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("closing_items")
    .select("*, closings(competency, closed_at)")
    .eq("partner_id", partnerId);
  if (error) {
    throw new Error("Não foi possível consultar os fechamentos.");
  }
  return data
    .map((row) => {
      const { closings, ...item } = row;
      return {
        ...item,
        competency: dateToCompetency(closings?.competency ?? ""),
        closed_at: closings?.closed_at ?? null,
      };
    })
    .filter((item) => item.competency !== "")
    .sort((a, b) => b.competency.localeCompare(a.competency));
}

// Saldo pendente do parceiro = total acumulado no fechamento fechado mais recente.
export function pendingBalanceOf(items: PartnerClosingItem[]): number {
  const latest = items[0];
  if (!latest || latest.decision !== "accumulate") {
    return 0;
  }
  return Number(latest.total);
}

export async function lastImportAt(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("last_import_at");
  if (error) {
    return null;
  }
  return data;
}
