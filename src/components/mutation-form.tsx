"use client";

import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import type { FormState } from "@/lib/auth/validation";
import { Button } from "./ui/button";

type MutationFormProps = {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
  label?: string;
  pendingLabel?: string;
  className?: string;
  variant?: "default" | "outline" | "destructive";
  // Rótulo do link devolvido pela ação (convite, nova senha).
  linkLabel?: string;
};

// Formulário com server action. O envio é feito fora de <form action> para que o React
// não limpe os campos quando a resposta traz um erro de validação.
export function MutationForm({
  action,
  children,
  label = "Salvar",
  pendingLabel = "Salvando…",
  className = "",
  variant = "default",
  linkLabel = "Link do convite",
}: MutationFormProps) {
  const [state, submit, pending] = useActionState<FormState, FormData>(action, {});

  useEffect(() => {
    if (state.destination) {
      window.location.assign(state.destination);
    }
  }, [state.destination]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      submit(data);
    });
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`} aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-4">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {state.success}
        </p>
      )}
      {state.link && (
        <label className="block text-sm">
          {linkLabel}
          <input
            readOnly
            value={state.link}
            className="mt-2 block w-full rounded border p-2"
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
    </form>
  );
}
