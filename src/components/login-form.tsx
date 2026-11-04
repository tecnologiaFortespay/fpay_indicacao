"use client";

import { useActionState, useEffect } from "react";
import { login } from "@/app/auth/actions";
import type { FormState } from "@/lib/auth/validation";
import { Notice } from "./notice";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function LoginForm({ disabled = false }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});

  useEffect(() => {
    // Navegação completa descarta o cache de rotas da sessão anterior.
    if (state.destination) {
      window.location.replace(state.destination);
    }
  }, [state.destination]);

  const blocked = disabled || pending || Boolean(state.destination);
  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com.br"
          required
          disabled={blocked}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={blocked}
        />
      </div>
      {state.error && (
        <Notice tone="danger" role="alert" compact>
          {state.error}
        </Notice>
      )}
      <Button className="w-full" size="lg" type="submit" disabled={blocked}>
        {pending ? "Aguarde…" : "Entrar"}
      </Button>
    </form>
  );
}
