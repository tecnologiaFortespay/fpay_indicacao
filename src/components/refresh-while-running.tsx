"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Recarrega os dados da página a cada poucos segundos enquanto a IA analisa. Vai até um pouco além
// dos 5 minutos em que o servidor considera a análise travada, para o botão voltar sozinho.
export function RefreshWhileRunning() {
  const router = useRouter();
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > 5.5 * 60 * 1000) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
