"use client";

import { useState } from "react";

type FormDisclosureProps = {
  // Texto do botão que abre o formulário (ex.: "Nova vigência").
  label: string;
  // Aberto de início quando ainda não há nada cadastrado.
  open?: boolean;
  // Uma frase do que o formulário faz, mostrada ao abrir.
  description?: React.ReactNode;
  children: React.ReactNode;
};

// Formulário de "adicionar" ou "editar" recolhido atrás de um botão, para a tela mostrar primeiro
// o que já existe. O estado inicial vale só na primeira renderização: depois de salvar, a página se
// atualiza e o bloco continua aberto, com a mensagem e o link (ex.: convite) à vista.
export function FormDisclosure({
  label,
  open = false,
  description,
  children,
}: FormDisclosureProps) {
  const [initiallyOpen] = useState(open);
  return (
    <details className="fp-disclosure" open={initiallyOpen}>
      <summary>{label}</summary>
      <div className="fp-disclosure-body">
        {description && <p className="fp-help">{description}</p>}
        {children}
      </div>
    </details>
  );
}
