import "server-only";
import { competencyToDate, currentCompetency, dateToCompetency } from "@/lib/competency";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Closing = Tables<"closings"> & { closed_by_name: string | null };

export type ClosingItem = Tables<"closing_items"> & {
  partner_name: string;
  decided_by_name: string | null;
};

export type ClosingDetail = {
  closing: Closing;
  items: ClosingItem[];
  totals: {
    month_amount: number;
    adjustment: number;
    previous_balance: number;
    total: number;
    to_pay: number;
  };
};

// Nomes de quem preparou, fechou ou decidiu (o diretor lê todos os perfis).
async function displayNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => id !== null)));
  const names = new Map<string, string>();
  if (ids.length === 0) {
    return names;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", ids);
  for (const profile of data ?? []) {
    names.set(profile.user_id, profile.display_name);
  }
  return names;
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
  const names = await displayNames(data.map((closing) => closing.closed_by));
  return data.map((closing) => ({
    ...closing,
    closed_by_name: closing.closed_by ? (names.get(closing.closed_by) ?? null) : null,
  }));
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
    .select("*, partners(name)")
    .eq("closing_id", closing.data.id);
  if (items.error) {
    throw new Error("Não foi possível consultar os itens do fechamento.");
  }
  const names = await displayNames([
    closing.data.closed_by,
    ...items.data.map((item) => item.decided_by),
  ]);
  const rows = items.data
    .map((row) => {
      const { partners, ...item } = row;
      return {
        ...item,
        partner_name: partners?.name ?? "—",
        decided_by_name: item.decided_by ? (names.get(item.decided_by) ?? null) : null,
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
  const closedByName = closing.data.closed_by ? (names.get(closing.data.closed_by) ?? null) : null;
  return { closing: { ...closing.data, closed_by_name: closedByName }, items: rows, totals };
}

export type ClosingChecks = {
  // O mês ainda não terminou (mês corrente ou futuro).
  not_ended: boolean;
  // Importação do mês feita depois do fim do mês, condição para fechar.
  import_after_month_end: { created_at: string } | null;
  // Mês anterior com importação que ainda precisa ser fechado antes ("YYYY-MM").
  blocker: string | null;
};

// Pré-requisitos mostrados nas etapas 01 e 02 (a função SQL confere de novo ao preparar e ao fechar).
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
  const blocker = await supabase.rpc("closing_blocker", { month });
  return {
    not_ended: competency >= currentCompetency(),
    import_after_month_end: batches.data?.[0] ?? null,
    blocker: blocker.data ? dateToCompetency(blocker.data) : null,
  };
}

// Último mês fechado ("YYYY-MM"): vigências que começam até ele não mudam mais.
export async function lastClosedCompetency(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("closings")
    .select("competency")
    .eq("status", "closed")
    .order("competency", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? dateToCompetency(data.competency) : null;
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
