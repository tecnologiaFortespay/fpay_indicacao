"use client";

import { useEffect, useState } from "react";
import { logout } from "@/app/auth/actions";
import { Button } from "./ui/button";

// Páginas restauradas do cache de navegação do navegador são recarregadas para refletir a sessão atual.
export function SessionGuard() {
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return null;
}

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setPending(true);
    try {
      const result = await logout();
      if (result.destination) {
        window.location.replace(result.destination);
        return;
      }
      setError(result.error ?? "Tente sair novamente.");
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    }
    setPending(false);
  }

  return (
    <div>
      <Button variant="outline" disabled={pending} onClick={handleLogout}>
        {pending ? "Saindo…" : "Sair"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
