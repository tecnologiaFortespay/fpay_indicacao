"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import type { FormState } from "@/lib/auth/validation";
import { Notice } from "./notice";
import { Button } from "./ui/button";

type MutationFormProps = {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
  label?: string;
  pendingLabel?: string;
  className?: string;
  variant?: "default" | "outline" | "destructive";
  size?: "default" | "sm";
  // Rótulo do link devolvido pela ação (convite, nova senha).
  linkLabel?: string;
  // Limpa os campos depois de salvar, para um segundo clique não repetir o cadastro. Formulários
  // de edição passam false para continuar mostrando os valores salvos.
  resetOnSuccess?: boolean;
  // Campos e botão na mesma linha (ex.: mudar situação dentro de uma tabela).
  inline?: boolean;
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
  size = "default",
  linkLabel = "Link do convite",
  resetOnSuccess = true,
  inline = false,
}: MutationFormProps) {
  const [state, submit, pending] = useActionState<FormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.destination) {
      window.location.assign(state.destination);
    }
  }, [state.destination]);

  useEffect(() => {
    if (state.success && resetOnSuccess) {
      formRef.current?.reset();
    }
  }, [state, resetOnSuccess]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      submit(data);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={`${inline ? "fp-inline-form" : "space-y-4"} ${className}`}
      aria-busy={pending}
    >
      <fieldset disabled={pending} className={inline ? "fp-inline-form" : "space-y-4"}>
        {children}
      </fieldset>
      {state.error && (
        <Notice tone="danger" compact role="alert">
          {state.error}
        </Notice>
      )}
      {state.success && (
        <Notice tone="success" compact role="status">
          {state.success}
        </Notice>
      )}
      {state.link && (
        <label className="fp-field">
          {linkLabel}
          <input
            readOnly
            value={state.link}
            className="fp-input fp-num"
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      <Button type="submit" variant={variant} size={size} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
    </form>
  );
}
