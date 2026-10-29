"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Recarrega os dados da página a cada poucos segundos enquanto a IA analisa (até 4 minutos).
export function RefreshWhileRunning() {
  const router = useRouter();
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > 4 * 60 * 1000) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
