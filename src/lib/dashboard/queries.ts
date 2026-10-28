import "server-only";
import { competencyToDate, dateToCompetency } from "@/lib/competency";
import { createClient } from "@/lib/supabase/server";

export type OverviewRow = {
  partner_id: string;
  name: string;
  kind: string;
  lives: number;
  value_per_life: string | null;
  amount: string;
};

export type Overview = {
  rows: OverviewRow[];
  total_lives: number;
  total_amount: string;
  partners_with_lives: number;
};

export async function latestCompetency(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("monthly_lives")
    .select("competency")
    .order("competency", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? dateToCompetency(data.competency) : null;
}

// Parceiros ativos com as vidas e o valor do mês, calculados pela view partner_month_amounts.
export async function directorOverview(competency: string): Promise<Overview> {
  const supabase = await createClient();
  const partners = await supabase
    .from("partners")
    .select("id, name, kind")
    .eq("status", "active")
    .order("name");
  if (partners.error) {
    throw new Error("Não foi possível consultar os parceiros.");
  }
  const amounts = await supabase
    .from("partner_month_amounts")
    .select("partner_id, lives, value_per_life, amount")
    .eq("competency", competencyToDate(competency));
  if (amounts.error) {
    throw new Error("Não foi possível consultar os valores do mês.");
  }
  const byPartner = new Map(amounts.data.map((row) => [row.partner_id, row]));
  let totalLives = 0;
  let totalAmount = 0;
  let partnersWithLives = 0;
  const rows = partners.data.map((partner) => {
    const amount = byPartner.get(partner.id);
    const lives = amount?.lives ?? 0;
    const value = Number(amount?.amount ?? 0);
    totalLives += lives;
    totalAmount += value;
    if (lives > 0) {
      partnersWithLives += 1;
    }
    const valuePerLife = amount?.value_per_life;
    return {
      partner_id: partner.id,
      name: partner.name,
      kind: partner.kind,
      lives,
      value_per_life:
        valuePerLife === null || valuePerLife === undefined ? null : String(valuePerLife),
      amount: value.toFixed(2),
    };
  });
  return {
    rows,
    total_lives: totalLives,
    total_amount: totalAmount.toFixed(2),
    partners_with_lives: partnersWithLives,
  };
}
