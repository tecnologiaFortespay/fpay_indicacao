import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured } from "@/lib/ai/claude";
import { appOrigin, builtAt, resolveConnection, type AuthConfig } from "@/lib/env";
import { mailSettings, missingMailVariables } from "@/lib/mail";
import { serviceClient } from "@/lib/supabase/admin";

// Diagnóstico público e sem segredos: versão no ar, endereço visto pelo servidor, de onde veio a
// conexão com o Supabase, se ele aceitou a chave, se a IA tem chave configurada e se o e-mail do
// "Esqueci minha senha" tem as variáveis dele. Serve para conferir um deploy sem acesso ao painel
// da hospedagem.
export async function GET(request: NextRequest) {
  const { config, sources, problems } = resolveConnection();
  return NextResponse.json(
    {
      versao: builtAt(),
      endereco: appOrigin(request.headers),
      supabase: config
        ? {
            endereco: config.url,
            origemEndereco: sources.url,
            origemChave: sources.anonKey,
            resposta: await supabaseAnswer(config),
          }
        : null,
      problemas: problems,
      ia: aiConfigured() ? "ligada" : "sem ANTHROPIC_API_KEY",
      email: mailState(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// E-mail do "Esqueci minha senha" (decisão 26): ligado quando o servidor tem as variáveis do envio
// e a chave de serviço; senão, quais faltam (só os nomes). Não testa a conexão com o servidor de
// e-mail: isso se confere pedindo uma nova senha.
function mailState(): string {
  const missing = missingMailVariables();
  if (serviceClient() === null) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (missing.length > 0) {
    return `desligado: falta ${missing.join(", ")}`;
  }
  return mailSettings() ? "ligado" : "desligado: SMTP_PORT inválida";
}

// 200: chave aceita; 401: chave recusada; texto: o servidor não alcançou o Supabase.
async function supabaseAnswer(config: AuthConfig): Promise<number | string> {
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.status;
  } catch (error) {
    return error instanceof Error ? error.message : "sem resposta";
  }
}
