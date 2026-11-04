"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { databaseError, formValue } from "@/lib/actions";
import { passwordSchema, type FormState } from "@/lib/auth/validation";
import { INVITATION_TOKEN_PATTERN } from "@/lib/invitations/queries";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({ password: passwordSchema, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, {
    message: "As senhas precisam ser iguais.",
    path: ["confirmation"],
  });

export async function resetWithLink(_previous: FormState, form: FormData): Promise<FormState> {
  const token = formValue(form, "token");
  if (!INVITATION_TOKEN_PATTERN.test(token)) {
    return { error: "Link de nova senha inválido." };
  }
  const input = schema.safeParse({
    password: form.get("password"),
    confirmation: form.get("confirmation"),
  });
  if (!input.success) {
    return { error: input.error.issues[0].message };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("reset_password_with_token", {
    secret: token,
    password: input.data.password,
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  redirect("/login?senha=alterada");
}
