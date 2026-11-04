import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Partner = Tables<"partners">;
export type PartnerRule = Tables<"partner_rules">;
export type Referral = Tables<"referrals">;

export async function listPartners(): Promise<Partner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("partners").select("*").order("name");
  if (error) {
    throw new Error("Não foi possível consultar os parceiros.");
  }
  return data;
}

export async function listPartnerOptions(): Promise<[string, string][]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partners")
    .select("id, name")
    .eq("status", "active")
    .order("name");
  if (error) {
    throw new Error("Não foi possível consultar os parceiros.");
  }
  return data.map((partner) => [partner.id, partner.name]);
}

export async function getPartner(id: string): Promise<Partner | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("partners").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error("Não foi possível consultar o parceiro.");
  }
  return data;
}

// Conta de acesso do parceiro (um login por parceiro), para o diretor gerar o link de nova senha.
export async function partnerLogin(partnerId: string): Promise<{ user_id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (error) {
    throw new Error("Não foi possível consultar o acesso do parceiro.");
  }
  return data;
}

export async function listPartnerRules(partnerId: string): Promise<PartnerRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_rules")
    .select("*")
    .eq("partner_id", partnerId)
    .order("valid_from", { ascending: false });
  if (error) {
    throw new Error("Não foi possível consultar as regras.");
  }
  return data;
}

export type RuleInForce = {
  value_per_life: number;
  term_months: number | null;
  valid_from: string;
};

// Regra do parceiro vigente no mês (maior vigência que começa até o mês), lida sob a RLS de quem pede.
export async function ruleInForce(
  partnerId: string,
  competency: string,
): Promise<RuleInForce | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_rules")
    .select("value_per_life, term_months, valid_from")
    .eq("partner_id", partnerId)
    .lte("valid_from", `${competency}-01`)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error("Não foi possível consultar a regra do parceiro.");
  }
  return data;
}

export async function listPartnerReferrals(partnerId: string): Promise<Referral[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("referrals")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("Não foi possível consultar as indicações.");
  }
  return data;
}

export type PartnerMonthAmount = {
  competency: string;
  lives: number;
  value_per_life: string | null;
  amount: string;
};

export async function listPartnerMonthAmounts(
  partnerId: string,
  limit = 12,
): Promise<PartnerMonthAmount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_month_amounts")
    .select("competency, lives, value_per_life, amount")
    .eq("partner_id", partnerId)
    .order("competency", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error("Não foi possível consultar os valores do parceiro.");
  }
  return data.map((row) => ({
    competency: row.competency ?? "",
    lives: row.lives ?? 0,
    value_per_life: row.value_per_life === null ? null : String(row.value_per_life),
    amount: String(row.amount ?? 0),
  }));
}
