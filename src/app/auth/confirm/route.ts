import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, authConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Link de nova senha com token_hash (gerado por `npm run reset-link`): o próprio sistema valida o
// token com o Supabase. Não depende da Site URL nem das Redirect URLs do painel, ao contrário do
// link que o Supabase manda por e-mail (/auth/callback).
export async function GET(request: NextRequest) {
  const origin = appOrigin(request.headers);
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (!authConfig() || !tokenHash || tokenHash.length > 2048 || type !== "recovery") {
    return NextResponse.redirect(new URL("/login?erro=link", origin));
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error) {
      return NextResponse.redirect(new URL("/login?erro=link", origin));
    }
    return NextResponse.redirect(new URL("/redefinir-senha", origin));
  } catch {
    return NextResponse.redirect(new URL("/login?erro=link", origin));
  }
}
