import "server-only";
import { competencyToDate } from "@/lib/competency";
import type { ReferralStatus } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type ReferralRow = Tables<"referrals"> & { partner_name: string };

export type ReferralFilter = {
  partnerId?: string;
  status?: string;
};

export async function listReferrals(filter: ReferralFilter = {}): Promise<ReferralRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("referrals")
    .select("*, partners(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter.partnerId) {
    query = query.eq("partner_id", filter.partnerId);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error("Não foi possível consultar as indicações.");
  }
  return data.map((row) => {
    const { partners, ...referral } = row;
    return { ...referral, partner_name: partners?.name ?? "—" };
  });
}

export type StatusCounts = Record<ReferralStatus, number>;

export async function referralStatusCounts(): Promise<StatusCounts> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("referrals").select("status");
  if (error) {
    throw new Error("Não foi possível contar as indicações.");
  }
  const counts: StatusCounts = {
    referred: 0,
    negotiating: 0,
    signed: 0,
    active: 0,
    delinquent: 0,
    lost: 0,
    cancelled: 0,
  };
  for (const row of data) {
    const status = row.status as ReferralStatus;
    if (status in counts) {
      counts[status] += 1;
    }
  }
  return counts;
}

// Vidas, valor por vida efetivo, prazo e valor de cada indicação no mês (view referral_month_lives, sob RLS).
export type ReferralMonth = {
  lives: number;
  value_per_life: number | null;
  term_months: number | null;
  amount: number;
};

export async function referralMonthValues(competency: string): Promise<Map<string, ReferralMonth>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referral_month_lives")
    .select("referral_id, lives, value_per_life, term_months, amount")
    .eq("competency", competencyToDate(competency));
  if (error) {
    throw new Error("Não foi possível consultar as vidas do mês.");
  }
  const values = new Map<string, ReferralMonth>();
  for (const row of data) {
    if (row.referral_id) {
      values.set(row.referral_id, {
        lives: row.lives ?? 0,
        value_per_life: row.value_per_life,
        term_months: row.term_months,
        amount: row.amount ?? 0,
      });
    }
  }
  return values;
}

export type ReferralDetail = ReferralRow;

export async function getReferral(id: string): Promise<ReferralDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referrals")
    .select("*, partners(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error("Não foi possível consultar a indicação.");
  }
  if (!data) {
    return null;
  }
  const { partners, ...referral } = data;
  return { ...referral, partner_name: partners?.name ?? "—" };
}

export type ReferralMonthRow = ReferralMonth & { competency: string };

// Meses em que as vidas da indicação contam, do mais recente ao mais antigo.
export async function referralMonths(id: string): Promise<ReferralMonthRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referral_month_lives")
    .select("competency, lives, value_per_life, term_months, amount")
    .eq("referral_id", id)
    .order("competency", { ascending: false })
    .limit(24);
  if (error) {
    throw new Error("Não foi possível consultar os meses da indicação.");
  }
  return data.map((row) => ({
    competency: row.competency ?? "",
    lives: row.lives ?? 0,
    value_per_life: row.value_per_life,
    term_months: row.term_months,
    amount: row.amount ?? 0,
  }));
}
