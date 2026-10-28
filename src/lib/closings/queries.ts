import "server-only";
import { competencyToDate } from "@/lib/competency";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Closing = Tables<"closings">;

export type ClosingItem = Tables<"closing_items"> & {
  partner_name: string;
  payment_method: string | null;
  pix_key: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
};

export type ClosingDetail = {
  closing: Closing;
  items: ClosingItem[];
  closed_by_name: string | null;
  totals: {
    month_amount: number;
    adjustment: number;
    previous_balance: number;
    total: number;
    to_pay: number;
  };
};

async function displayName(userId: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.display_name ?? null;
}

export async function listClosings(): Promise<Closing[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("closings")
    .select("*")
    .order("competency", { ascending: false });
  if (error) {
    throw new Error("Não foi possível consultar os fechamentos.");
  }
  return data;
}

export async function getClosing(competency: string): Promise<ClosingDetail | null> {
  const supabase = await createClient();
  const closing = await supabase
    .from("closings")
    .select("*")
    .eq("competency", competencyToDate(competency))
    .maybeSingle();
  if (closing.error) {
    throw new Error("Não foi possível consultar o fechamento.");
  }
  if (!closing.data) {
    return null;
  }
  const items = await supabase
    .from("closing_items")
    .select("*, partners(name, payment_method, pix_key, bank_name, bank_branch, bank_account)")
    .eq("closing_id", closing.data.id);
  if (items.error) {
    throw new Error("Não foi possível consultar os itens do fechamento.");
  }
  const rows = items.data
    .map((row) => {
      const { partners, ...item } = row;
      return {
        ...item,
        partner_name: partners?.name ?? "—",
        payment_method: partners?.payment_method ?? null,
        pix_key: partners?.pix_key ?? null,
        bank_name: partners?.bank_name ?? null,
        bank_branch: partners?.bank_branch ?? null,
        bank_account: partners?.bank_account ?? null,
      };
    })
    .sort((a, b) => a.partner_name.localeCompare(b.partner_name, "pt-BR"));
  const totals = { month_amount: 0, adjustment: 0, previous_balance: 0, total: 0, to_pay: 0 };
  for (const item of rows) {
    totals.month_amount += Number(item.month_amount);
    totals.adjustment += Number(item.adjustment);
    totals.previous_balance += Number(item.previous_balance);
    totals.total += Number(item.total);
    if (item.decision === "pay") {
      totals.to_pay += Number(item.total);
    }
  }
  return {
    closing: closing.data,
    items: rows,
    closed_by_name: await displayName(closing.data.closed_by),
    totals,
  };
}

export type ClosingChecks = {
  import_after_month_end: { created_at: string } | null;
  previous_open: string | null;
};

// Pré-requisitos mostrados na etapa 01 (a função SQL confere de novo ao preparar).
export async function closingChecks(competency: string): Promise<ClosingChecks> {
  const supabase = await createClient();
  const month = competencyToDate(competency);
  const monthEnd = new Date(`${month}T00:00:00-03:00`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const batches = await supabase
    .from("import_batches")
    .select("created_at")
    .contains("competencies", [month])
    .gte("created_at", monthEnd.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const previous = await supabase
    .from("closings")
    .select("competency, status")
    .lt("competency", month)
    .order("competency", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousOpen =
    previous.data && previous.data.status !== "closed" ? previous.data.competency : null;
  return { import_after_month_end: batches.data?.[0] ?? null, previous_open: previousOpen };
}

export type PendingBalances = {
  by_partner: Map<string, number>;
  total: number;
  competency: string | null;
};

// Saldo pendente = total acumulado de cada parceiro no último fechamento fechado.
export async function pendingBalances(): Promise<PendingBalances> {
  const supabase = await createClient();
  const latest = await supabase
    .from("closings")
    .select("id, competency")
    .eq("status", "closed")
    .order("competency", { ascending: false })
    .limit(1)
    .maybeSingle();
  const byPartner = new Map<string, number>();
  if (!latest.data) {
    return { by_partner: byPartner, total: 0, competency: null };
  }
  const items = await supabase
    .from("closing_items")
    .select("partner_id, total")
    .eq("closing_id", latest.data.id)
    .eq("decision", "accumulate");
  let total = 0;
  for (const item of items.data ?? []) {
    const value = Number(item.total);
    byPartner.set(item.partner_id, value);
    total += value;
  }
  return { by_partner: byPartner, total, competency: latest.data.competency };
}
