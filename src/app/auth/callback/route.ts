import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, authConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Destino do link de redefinição de senha enviado pelo Supabase: troca o código pela sessão.
export async function GET(request: NextRequest) {
  const config = authConfig();
  const origin = appOrigin(request.headers);
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!config || !code || code.length > 2048) {
    return NextResponse.redirect(new URL("/login?erro=link", origin));
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?erro=link", origin));
    }
    return NextResponse.redirect(new URL(safeNext, origin));
  } catch {
    return NextResponse.redirect(new URL("/login?erro=link", origin));
  }
}
