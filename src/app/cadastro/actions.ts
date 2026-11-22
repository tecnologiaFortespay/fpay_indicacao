"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { databaseError, formValue } from "@/lib/actions";
import { ensureAccount } from "@/lib/auth/signup";
import { emailSchema, type FormState } from "@/lib/auth/validation";
import { authConfig } from "@/lib/env";
import { formatPhone, isCompletePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

// Cidade, UF e telefone são obrigatórios (pedido do Denis, 14/11/2026). Devolve a mensagem do
// primeiro campo que falta, se houver. O banco confere de novo em register_partner.
function missingPartnerField(payload: {
  name: string;
  city: string;
  state: string;
  contact_name: string;
  contact_phone: string;
}): string | null {
  if (payload.name.trim() === "") {
    return "Informe o nome da unidade ou do parceiro.";
  }
  if (payload.city.trim() === "") {
    return "Informe a cidade.";
  }
  if (!/^[A-Za-z]{2}$/.test(payload.state.trim())) {
    return "Informe a UF com duas letras.";
  }
  if (payload.contact_name.trim() === "") {
    return "Informe o nome do responsável.";
  }
  if (payload.contact_phone.trim() === "") {
    return "Informe o telefone.";
  }
  if (!isCompletePhone(payload.contact_phone)) {
    return "Informe o telefone com DDD, por exemplo (86) 99999-0000.";
  }
  return null;
}

// Cadastro aberto (decisão 25): o parceiro cria a conta e o cadastro de uma vez, sem convite. O
// cadastro fica pendente até um diretor aprovar, que é quando ele escolhe o tipo e a regra.
export async function registerPartner(_previous: FormState, form: FormData): Promise<FormState> {
  if (!authConfig()) {
    return { error: "O cadastro está temporariamente indisponível." };
  }
  const payload = {
    name: formValue(form, "name"),
    city: formValue(form, "city"),
    state: formValue(form, "state"),
    contact_name: formValue(form, "contact_name"),
    // Gravado sempre no formato da máscara: (DDD) 9XXXX-XXXX.
    contact_phone: formatPhone(formValue(form, "contact_phone")),
  };
  // Antes de criar a conta: campo faltando não pode deixar uma conta sem cadastro para trás.
  const missing = missingPartnerField(payload);
  if (missing) {
    return { error: missing };
  }
  const supabase = await createClient();
  const problem = await ensureAccount(supabase, form, payload.contact_name.trim());
  if (problem) {
    return { error: problem };
  }
  const result = await supabase.rpc("register_partner", { payload });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  // O cadastro novo aparece em "Aguardando aprovação" para o diretor.
  revalidatePath("/parceiros");
  revalidatePath("/inicio");
  // Redireciona no servidor: com a conta já conectada, a página do cadastro sairia do ar.
  redirect("/cadastro-em-analise");
}

// Pedido de conta do vendedor (decisão 29): o nome, o e-mail da unidade a que pertence e a conta de
// acesso. O pedido fica pendente até um diretor aprovar em Parceiros.
export async function registerSeller(_previous: FormState, form: FormData): Promise<FormState> {
  if (!authConfig()) {
    return { error: "O cadastro está temporariamente indisponível." };
  }
  // Antes de criar a conta: campo faltando não pode deixar uma conta sem cadastro para trás.
  const name = formValue(form, "name").trim();
  if (name === "") {
    return { error: "Informe o seu nome." };
  }
  const unitEmail = emailSchema.safeParse(formValue(form, "unit_email"));
  if (!unitEmail.success) {
    return { error: "Informe o e-mail da unidade." };
  }
  const supabase = await createClient();
  const problem = await ensureAccount(supabase, form, name);
  if (problem) {
    return { error: problem };
  }
  const result = await supabase.rpc("register_seller", {
    payload: { name, unit_email: unitEmail.data },
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  // O pedido novo aparece em "Vendedores pedindo acesso" para o diretor.
  revalidatePath("/parceiros");
  revalidatePath("/inicio");
  redirect("/cadastro-em-analise");
}
