"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { actionUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export async function respondClosingItem(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("partner");
  if (!user) {
    return { error: "Você não tem permissão para esta operação." };
  }
  const id = formValue(form, "id");
  if (!z.uuid().safeParse(id).success) {
    return { error: "Fechamento inválido." };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("respond_closing_item", {
    target: id,
    response: formValue(form, "response"),
    note: formValue(form, "note"),
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePath("/fechamentos");
  revalidatePath("/inicio");
  revalidatePath("/fechamento");
  return { success: "Resposta registrada." };
}
