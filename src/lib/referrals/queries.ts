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

// Vidas que contam por indicação no mês (view referral_month_lives, sob RLS do usuário).
export async function livesByReferral(competency: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referral_month_lives")
    .select("referral_id, lives")
    .eq("competency", competencyToDate(competency));
  if (error) {
    throw new Error("Não foi possível consultar as vidas do mês.");
  }
  const lives = new Map<string, number>();
  for (const row of data) {
    if (row.referral_id) {
      lives.set(row.referral_id, row.lives ?? 0);
    }
  }
  return lives;
}
