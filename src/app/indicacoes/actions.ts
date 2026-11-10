"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { actionUser, deniedState } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import { withFlash } from "@/lib/flash";
import { parseMoneyInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export async function setReferralStatus(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const id = formValue(form, "id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "Indicação inválida." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("set_referral_status", {
    target: id,
    new_status: formValue(form, "status"),
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePath("/indicacoes");
  revalidatePath(`/indicacoes/${id}`);
  revalidatePath("/inicio");
  // Volta para onde a mudança foi feita (lista com filtros ou detalhe), com o aviso.
  const back = formValue(form, "return_to");
  const destination = /^\/indicacoes(\/[0-9a-f-]{36})?(\?[^#]*)?$/.test(back)
    ? back
    : "/indicacoes";
  redirect(withFlash(destination, "situacao_atualizada"));
}

// Vendedor da indicação (texto livre; em branco apaga). Só o diretor corrige depois do registro
// (decisão 22). Login e comissão de vendedor continuam fase 2.
export async function setReferralSeller(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const id = formValue(form, "id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "Indicação inválida." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("set_referral_seller", {
    target: id,
    name: formValue(form, "seller_name"),
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePath("/indicacoes");
  revalidatePath(`/indicacoes/${id}`);
  revalidatePath("/parceiros/[id]", "page");
  return { success: "Vendedor salvo." };
}

// Configuração própria da indicação (valor por vida e prazo). Em branco = regra do parceiro.
export async function setReferralConfig(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const id = formValue(form, "id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "Indicação inválida." };
  }
  const rawValue = formValue(form, "value_per_life").trim();
  const valuePerLife = rawValue === "" ? "" : parseMoneyInput(rawValue);
  if (valuePerLife === null) {
    return {
      error: "Informe o valor por vida como 1,50, ou deixe em branco para usar o do parceiro.",
    };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("set_referral_config", {
    target: id,
    payload: { value_per_life: valuePerLife, term_months: formValue(form, "term_months") },
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePath("/indicacoes");
  revalidatePath(`/indicacoes/${id}`);
  revalidatePath("/parceiros/[id]", "page");
  revalidatePath("/inicio");
  return { success: "Valor e prazo da indicação salvos." };
}
