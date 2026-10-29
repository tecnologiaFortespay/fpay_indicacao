import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, builtAt, resolveConnection, type AuthConfig } from "@/lib/env";

// Diagnóstico público e sem segredos: versão no ar, endereço visto pelo servidor, de onde veio a
// conexão com o Supabase e se ele aceitou a chave. Serve para conferir um deploy sem acesso ao
// painel da hospedagem.
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
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
