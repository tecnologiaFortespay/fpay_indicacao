"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

// Erro inesperado numa página: explica em português e oferece tentar de novo. O código (digest)
// liga a tela ao registro do servidor na Vercel.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="fp-auth-form-panel min-h-dvh">
      <div className="fp-auth-card space-y-4">
        <header>
          <h1>Algo deu errado</h1>
          <p>
            Não foi possível mostrar esta página agora. Tente de novo em instantes; se continuar,
            avise a Fortes Pay e informe o código abaixo.
          </p>
        </header>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => retry()}>
            Tentar de novo
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Ir para o início
          </Link>
        </div>
        {digest && <p className="fp-help fp-num">Código: {digest}</p>}
      </div>
    </main>
  );
}
