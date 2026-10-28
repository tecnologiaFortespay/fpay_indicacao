"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { passwordSchema, type FormState } from "@/lib/auth/validation";
import { AUTH_COOKIE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({ password: passwordSchema, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, {
    message: "As senhas precisam ser iguais.",
    path: ["confirmation"],
  });

export async function resetPassword(_previous: FormState, form: FormData): Promise<FormState> {
  const input = schema.safeParse({
    password: form.get("password"),
    confirmation: form.get("confirmation"),
  });
  if (!input.success) {
    return { error: input.error.issues[0].message };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Este link expirou ou já foi usado. Solicite uma nova recuperação." };
  }
  const { error } = await supabase.auth.updateUser({ password: input.data.password });
  if (error) {
    return { error: "Não foi possível definir esta senha. Use uma senha diferente." };
  }
  await supabase.auth.signOut({ scope: "local" });
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith(AUTH_COOKIE)) {
      store.delete(cookie.name);
    }
  }
  // Redireciona no servidor: sem a sessão, a nova renderização da página mandaria para "esqueci a senha".
  redirect("/login?senha=alterada");
}
