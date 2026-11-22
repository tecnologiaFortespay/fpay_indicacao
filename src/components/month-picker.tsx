"use client";

import type { FormEvent } from "react";
import { Field } from "./fields";

export type MonthPickerProps = {
  value: string;
  label?: string;
  // Outros parâmetros da página que precisam continuar na URL ao trocar o mês.
  keep?: Record<string, string>;
};

// Mês completo e plausível: quem digita o ano passa por "0002", "0020"… antes de chegar a "2026".
const PLAUSIBLE_MONTH = /^20\d{2}-(0[1-9]|1[0-2])$/;

// Seletor de mês por GET: a página relê os dados do mês escolhido assim que ele muda, sem botão.
export function MonthPicker({ value, label = "Mês", keep = {} }: MonthPickerProps) {
  function showMonth(event: FormEvent<HTMLFormElement>) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.name !== "competency") {
      return;
    }
    if (PLAUSIBLE_MONTH.test(field.value) && field.value !== value) {
      event.currentTarget.requestSubmit();
    }
  }

  return (
    <form className="fp-month-picker" onChange={showMonth}>
      {Object.entries(keep).map(([name, keptValue]) => (
        <input key={name} type="hidden" name={name} value={keptValue} />
      ))}
      <Field name="competency" label={label} type="month" defaultValue={value} required compact />
    </form>
  );
}
