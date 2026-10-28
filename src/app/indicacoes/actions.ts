"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { actionUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export async function setReferralStatus(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return { error: "Você não tem permissão para esta operação." };
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
  revalidatePath("/inicio");
  return { success: "Situação atualizada." };
}
