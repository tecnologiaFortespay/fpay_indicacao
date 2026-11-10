import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const directorSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
  email: z.string(),
  created_at: z.string(),
});

export type Director = z.infer<typeof directorSchema>;

// Diretores com o e-mail de acesso (função SQL list_directors; só o diretor chama).
export async function listDirectors(): Promise<Director[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_directors");
  if (error) {
    throw new Error("Não foi possível consultar a equipe.");
  }
  return z.array(directorSchema).parse(data);
}
