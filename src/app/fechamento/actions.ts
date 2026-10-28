"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { actionUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import { competencyToDate, isCompetency } from "@/lib/competency";
import { parseMoneyInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const forbidden: FormState = { error: "Você não tem permissão para esta operação." };

function revalidateClosing() {
  revalidatePath("/fechamento");
  revalidatePath("/fechamentos");
  revalidatePath("/inicio");
}

export async function prepareClosing(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return forbidden;
  }
  const competency = formValue(form, "competency");
  if (!isCompetency(competency)) {
    return { error: "Informe o mês do fechamento." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("prepare_closing", { month: competencyToDate(competency) });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidateClosing();
  return { success: "Cálculo preparado. Confira os valores e marque quem será pago." };
}

export async function setClosingAdjustment(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return forbidden;
  }
  const id = formValue(form, "id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "Item inválido." };
  }
  const amount = parseMoneyInput(formValue(form, "amount") || "0");
  if (amount === null) {
    return { error: "Informe o ajuste como valor em reais, por exemplo -10,00." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("set_closing_adjustment", {
    target: id,
    amount: Number(amount),
    note: formValue(form, "note"),
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidateClosing();
  return { success: "Ajuste salvo." };
}

export async function closeClosing(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return forbidden;
  }
  const id = formValue(form, "closing_id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "Fechamento inválido." };
  }
  if (formValue(form, "confirmation") !== "on") {
    return { error: "Confirme que conferiu os valores antes de fechar o lote." };
  }
  const paid = form.getAll("pay").filter((value): value is string => typeof value === "string");
  if (paid.some((value) => !z.uuid().safeParse(value).success)) {
    return { error: "Parceiro marcado inválido." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("close_closing", { target: id, paid_partner_ids: paid });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidateClosing();
  return { success: "Lote fechado. Nada mais entra neste mês." };
}
