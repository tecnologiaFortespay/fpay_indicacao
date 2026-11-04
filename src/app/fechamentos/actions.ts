"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { actionUser, deniedState } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import { withFlash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

export async function respondClosingItem(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("partner");
  if (!user) {
    return deniedState();
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
  redirect(withFlash("/fechamentos", "resposta_registrada"));
}
