import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type ImportBatch = Tables<"import_batches"> & { author: string };
export type ImportRow = Tables<"import_rows">;

export const BATCH_PAGE_SIZE = 20;

async function authorNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) {
    return names;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);
  for (const profile of data ?? []) {
    names.set(profile.user_id, profile.display_name);
  }
  return names;
}

export async function listBatches(page: number): Promise<{ items: ImportBatch[]; total: number }> {
  const supabase = await createClient();
  const from = (page - 1) * BATCH_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("import_batches")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + BATCH_PAGE_SIZE - 1);
  if (error) {
    throw new Error("Não foi possível consultar as importações.");
  }
  const names = await authorNames(Array.from(new Set(data.map((batch) => batch.created_by))));
  const items = data.map((batch) => ({ ...batch, author: names.get(batch.created_by) ?? "—" }));
  return { items, total: count ?? 0 };
}

export async function getBatch(
  id: string,
): Promise<{ batch: ImportBatch; rows: ImportRow[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error("Não foi possível consultar a importação.");
  }
  if (!data) {
    return null;
  }
  const names = await authorNames([data.created_by]);
  const rows = await supabase
    .from("import_rows")
    .select("*")
    .eq("batch_id", id)
    .order("line_number")
    .limit(2000);
  if (rows.error) {
    throw new Error("Não foi possível consultar as linhas da importação.");
  }
  return { batch: { ...data, author: names.get(data.created_by) ?? "—" }, rows: rows.data };
}

export type LatestImport = { created_at: string; author: string };

// Carimbo "dados atualizados em" mostrado em todos os painéis.
export async function latestImport(): Promise<LatestImport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const names = await authorNames([data.created_by]);
  return { created_at: data.created_at, author: names.get(data.created_by) ?? "—" };
}
