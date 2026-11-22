"use client";

import { useId, useState } from "react";
import { formatPhone } from "@/lib/phone";
import { FieldShell } from "./fields";

type PhoneFieldProps = {
  label: string;
  name: string;
  required?: boolean;
};

const HINT = "Com DDD, por exemplo (86) 99999-0000.";

// Telefone com máscara: o campo formata (DDD) 9XXXX-XXXX enquanto a pessoa digita.
export function PhoneField({ label, name, required }: PhoneFieldProps) {
  const hintId = useId();
  const [value, setValue] = useState("");
  return (
    <FieldShell label={label} required={required} hint={HINT} hintId={hintId}>
      <input
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        value={value}
        onChange={(event) => setValue(formatPhone(event.target.value))}
        maxLength={15}
        placeholder="(00) 90000-0000"
        pattern="\(\d{2}\) \d{4,5}-\d{4}"
        title="Telefone com DDD, por exemplo (86) 99999-0000"
        aria-describedby={hintId}
        className="fp-input"
      />
    </FieldShell>
  );
}
