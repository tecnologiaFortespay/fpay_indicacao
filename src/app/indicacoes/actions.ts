"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { actionUser, deniedState } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import { competencyToDate, isCompetency } from "@/lib/competency";
import { withFlash } from "@/lib/flash";
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

// Vigência do parceiro que vale para a indicação (decisão 27): o diretor escolhe uma das vigências
// cadastradas do parceiro, na tela do envio da planilha ou na ficha da indicação. Em branco volta à
// escolha automática (mês da indicação ou do primeiro pagamento).
export async function setReferralRule(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const id = formValue(form, "id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "Indicação inválida." };
  }
  const month = formValue(form, "rule_month");
  if (month !== "" && !isCompetency(month)) {
    return { error: "Escolha uma das vigências do parceiro." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("set_referral_rule_month", {
    target: id,
    ...(month === "" ? {} : { month: competencyToDate(month) }),
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  // Todas as telas que mostram o valor por vida ou o valor do mês da indicação.
  for (const path of ["/indicacoes", "/inicio", "/fechamento", "/importacoes"]) {
    revalidatePath(path);
  }
  revalidatePath(`/indicacoes/${id}`);
  revalidatePath("/parceiros/[id]", "page");
  revalidatePath("/importacoes/[id]", "page");
  // Volta para onde a escolha foi feita (envio da planilha ou ficha da indicação), com o aviso.
  const back = formValue(form, "return_to");
  const destination = /^\/(indicacoes|importacoes)\/[0-9a-f-]{36}$/.test(back)
    ? back
    : `/indicacoes/${id}`;
  redirect(withFlash(destination, "regra_escolhida"));
}

// Valor e prazo próprios da indicação são vigências (decisão 23): savePartnerRule/deletePartnerRule
// em src/app/parceiros/actions.ts, com referral_id.
