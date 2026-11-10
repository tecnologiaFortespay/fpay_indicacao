"use server";

import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { actionUser, deniedState } from "@/lib/auth/session";
import { passwordSchema, type FormState } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    current: z.string().min(1, "Informe a senha atual."),
    password: passwordSchema,
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "As senhas precisam ser iguais.",
    path: ["confirmation"],
  });

// Troca a própria senha (diretor ou parceiro) conferindo a atual no banco; a sessão continua.
export async function changePassword(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director", "partner");
  if (!user) {
    return deniedState();
  }
  const input = schema.safeParse({
    current: formValue(form, "current_password"),
    password: form.get("password"),
    confirmation: form.get("confirmation"),
  });
  if (!input.success) {
    return { error: input.error.issues[0].message };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("change_my_password", {
    current_password: input.data.current,
    new_password: input.data.password,
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  return { success: "Senha alterada. Use a nova senha no próximo acesso." };
}
