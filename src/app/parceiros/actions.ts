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

function revalidatePartner(partnerId: string) {
  revalidatePath("/parceiros");
  revalidatePath(`/parceiros/${partnerId}`);
  revalidatePath("/inicio");
}

export async function savePartner(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return forbidden;
  }
  const id = formValue(form, "id");
  const payload = {
    id,
    name: formValue(form, "name"),
    kind: formValue(form, "kind"),
    city: formValue(form, "city"),
    state: formValue(form, "state"),
    contact_name: formValue(form, "contact_name"),
    contact_email: formValue(form, "contact_email"),
    contact_phone: formValue(form, "contact_phone"),
    payment_method: formValue(form, "payment_method"),
    pix_key: formValue(form, "pix_key"),
    bank_name: formValue(form, "bank_name"),
    bank_branch: formValue(form, "bank_branch"),
    bank_account: formValue(form, "bank_account"),
  };
  const supabase = await createClient();
  const result = await supabase.rpc("save_partner", { payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePartner(result.data);
  if (id === "") {
    return { success: "Parceiro cadastrado.", destination: `/parceiros/${result.data}` };
  }
  return { success: "Dados do parceiro salvos." };
}

export async function savePartnerRule(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return forbidden;
  }
  const partnerId = formValue(form, "partner_id");
  if (!z.uuid().safeParse(partnerId).success) {
    return { error: "Parceiro inválido." };
  }
  const valuePerLife = parseMoneyInput(formValue(form, "value_per_life"));
  if (valuePerLife === null) {
    return { error: "Informe o valor por vida, por exemplo 1,50." };
  }
  const validFrom = formValue(form, "valid_from");
  if (!isCompetency(validFrom)) {
    return { error: "Informe o mês de início da vigência." };
  }
  const payload = {
    id: formValue(form, "id"),
    partner_id: partnerId,
    value_per_life: valuePerLife,
    valid_from: competencyToDate(validFrom),
    term_months: formValue(form, "term_months"),
  };
  const supabase = await createClient();
  const result = await supabase.rpc("save_partner_rule", { payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePartner(partnerId);
  return { success: "Regra salva." };
}

export async function deletePartnerRule(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return forbidden;
  }
  const id = formValue(form, "id");
  const partnerId = formValue(form, "partner_id");
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(partnerId).success) {
    return { error: "Regra inválida." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("delete_partner_rule", { target: id });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePartner(partnerId);
  return { success: "Vigência removida." };
}

export async function createReferral(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director", "partner");
  if (!user) {
    return forbidden;
  }
  const payload = {
    partner_id: formValue(form, "partner_id"),
    cnpj: formValue(form, "cnpj"),
    company_name: formValue(form, "company_name"),
    estimated_lives: formValue(form, "estimated_lives"),
  };
  const supabase = await createClient();
  const result = await supabase.rpc("create_referral", { payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  if (payload.partner_id !== "") {
    revalidatePartner(payload.partner_id);
  }
  revalidatePath("/indicacoes");
  return { success: "Indicação registrada." };
}
