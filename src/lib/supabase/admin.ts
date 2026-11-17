import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/env";
import type { Database } from "./types";

// Cliente com a chave de serviço (SUPABASE_SERVICE_ROLE_KEY, só no servidor), que passa por cima da
// RLS. Tem um uso só: gerar o link de nova senha de quem pediu pelo e-mail (decisão 26), função que
// o navegador não pode chamar. Tudo o mais continua no cliente com a sessão do usuário
// (src/lib/supabase/server.ts). Null quando a chave não está configurada.
export function serviceClient() {
  const config = authConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !key) {
    return null;
  }
  return createClient<Database>(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
