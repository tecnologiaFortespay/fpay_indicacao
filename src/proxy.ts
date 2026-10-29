import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, appOrigin, authConfig } from "@/lib/env";

// Renova a sessão do Supabase a cada requisição e impede cache de páginas autenticadas.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = authConfig();
  const hasSessionCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith(AUTH_COOKIE));
  if (config && hasSessionCookie) {
    const supabase = createServerClient(config.url, config.anonKey, {
      cookieOptions: {
        name: AUTH_COOKIE,
        sameSite: "lax",
        path: "/",
        httpOnly: true,
        secure: appOrigin(request.headers).startsWith("https:"),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(values) {
          for (const { name, value } of values) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of values) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    await supabase.auth.getUser();
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
