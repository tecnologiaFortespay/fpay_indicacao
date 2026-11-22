"use client";

import { useEffect, useRef } from "react";

// Checkboxes de quem recebe (name="pay") ligados ao formulário de fechamento e que podem ser
// marcados: parceiro sem valor a pagar fica desabilitado e fora da conta.
function payBoxes(form: string): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[name="pay"][form="${form}"]:enabled`),
  );
}

// "Marcar ou desmarcar todos" no cabeçalho da coluna Parceiro. Acompanha os checkboxes das linhas:
// marcado quando todos estão, parcial quando só alguns.
export function PayAllCheckbox({ form }: { form: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function sync() {
      const all = ref.current;
      if (!all) {
        return;
      }
      const boxes = payBoxes(form);
      const checked = boxes.filter((box) => box.checked).length;
      all.disabled = boxes.length === 0;
      all.checked = boxes.length > 0 && checked === boxes.length;
      all.indeterminate = checked > 0 && checked < boxes.length;
    }
    sync();
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, [form]);

  return (
    <input
      ref={ref}
      type="checkbox"
      defaultChecked
      aria-label="Marcar ou desmarcar todos os parceiros"
      onChange={(event) => {
        for (const box of payBoxes(form)) {
          box.checked = event.target.checked;
        }
      }}
    />
  );
}
