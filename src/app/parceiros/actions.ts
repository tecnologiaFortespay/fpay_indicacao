"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { passwordResetLink } from "@/lib/auth/password-reset-link";
import { actionUser, deniedState } from "@/lib/auth/session";
import { normalizeCnpj } from "@/lib/cnpj";
import { appOrigin } from "@/lib/env";
import { withFlash } from "@/lib/flash";
import { partnerLogin } from "@/lib/partners/queries";
import type { FormState } from "@/lib/auth/validation";
import { competencyToDate, isCompetency } from "@/lib/competency";
import { parseMoneyInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

function revalidatePartner(partnerId: string) {
  revalidatePath("/parceiros");
  revalidatePath(`/parceiros/${partnerId}`);
  revalidatePath("/inicio");
}

export async function savePartner(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
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
    return deniedState();
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
    return deniedState();
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
  redirect(withFlash(`/parceiros/${partnerId}`, "vigencia_removida"));
}

export async function createReferral(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director", "partner");
  if (!user) {
    return deniedState();
  }
  // Valor e prazo da indicação: só o formulário do diretor tem esses campos; em branco = regra do parceiro.
  const rawValue = formValue(form, "value_per_life").trim();
  const valuePerLife = rawValue === "" ? "" : parseMoneyInput(rawValue);
  if (valuePerLife === null) {
    return { error: "Informe o valor por vida da indicação como 1,50, ou deixe em branco." };
  }
  const payload = {
    partner_id: formValue(form, "partner_id"),
    cnpj: formValue(form, "cnpj"),
    company_name: formValue(form, "company_name"),
    estimated_lives: formValue(form, "estimated_lives"),
    value_per_life: valuePerLife,
    term_months: formValue(form, "term_months"),
  };
  const supabase = await createClient();
  const result = await supabase.rpc("create_referral", { payload });
  if (result.error) {
    const message = databaseError(result.error);
    if (result.error.message === "REFERRAL_DUPLICATE" && user.profile.role === "director") {
      return { error: await withFirstReferrer(message, payload.cnpj) };
    }
    return { error: message };
  }
  if (payload.partner_id !== "") {
    revalidatePartner(payload.partner_id);
  }
  revalidatePath("/indicacoes");
  return { success: "Indicação registrada." };
}

export async function createInvitation(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const validUntil = formValue(form, "valid_until");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return { error: "Informe a validade do convite." };
  }
  const secret = randomBytes(32).toString("base64url");
  const payload = {
    partner_name: formValue(form, "partner_name"),
    kind: formValue(form, "kind"),
    // Fim do dia em Fortaleza (UTC-3, sem horário de verão), como o diretor lê no formulário.
    valid_until: `${validUntil}T23:59:59-03:00`,
    secret,
  };
  const supabase = await createClient();
  const result = await supabase.rpc("create_invitation", { payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePath("/parceiros");
  return {
    success: "Convite criado. Copie o link abaixo e envie ao parceiro.",
    link: `${appOrigin(await headers())}/convite/${secret}`,
  };
}

// Enquanto o e-mail do Supabase não é confiável, a nova senha sai por um link que o diretor envia.
export async function createPasswordReset(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const login = await partnerLogin(formValue(form, "partner_id"));
  if (!login) {
    return { error: "Este parceiro ainda não tem login." };
  }
  return passwordResetLink(login.user_id, "parceiro");
}

export async function approvePartner(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
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
    partner_id: partnerId,
    value_per_life: valuePerLife,
    valid_from: competencyToDate(validFrom),
    term_months: formValue(form, "term_months"),
  };
  const supabase = await createClient();
  const result = await supabase.rpc("approve_partner", { payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePartner(partnerId);
  redirect(withFlash(`/parceiros/${partnerId}`, "parceiro_aprovado"));
}

export async function rejectPartner(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState();
  }
  const partnerId = formValue(form, "partner_id");
  if (!z.uuid().safeParse(partnerId).success) {
    return { error: "Parceiro inválido." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("reject_partner", {
    target: partnerId,
    reason: formValue(form, "reason"),
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePartner(partnerId);
  redirect(withFlash(`/parceiros/${partnerId}`, "cadastro_recusado"));
}

// Só o diretor vê quem indicou primeiro (o parceiro recebe apenas a data).
async function withFirstReferrer(message: string, cnpj: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("referrals")
    .select("partners(name)")
    .eq("cnpj", normalizeCnpj(cnpj))
    .maybeSingle();
  const name = data?.partners?.name;
  if (!name) {
    return message;
  }
  return `${message.replace(/\.$/, "")} por ${name}.`;
}
