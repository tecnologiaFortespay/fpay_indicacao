// Os testes de banco e de ponta a ponta apagam dados. Por segurança, só rodam contra o Supabase
// local (chaves em .env.test), nunca contra o projeto apontado por .env.local.
export function assertLocalSupabase(url: string | undefined): string {
  const host = url ? new URL(url).hostname : "";
  const local = host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  if (!url || !local) {
    throw new Error(
      `Os testes só rodam contra o Supabase local; NEXT_PUBLIC_SUPABASE_URL=${url ?? "(vazio)"}. Confira .env.test.`,
    );
  }
  return url;
}
