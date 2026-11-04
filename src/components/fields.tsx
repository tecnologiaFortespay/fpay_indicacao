import { useId } from "react";

type FieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
  minLength?: number;
  min?: number | string;
  max?: number | string;
  step?: string;
  placeholder?: string;
  hint?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel";
  accept?: string;
  // Sem a dica automática de formato do mês (seletores de mês no topo da página).
  compact?: boolean;
};

// O rótulo leva só o nome do campo: o asterisco dos obrigatórios vem do CSS e a ajuda fica fora do
// <label>, ligada por aria-describedby. Assim o leitor de tela lê "Empresa, obrigatório" e depois a
// ajuda, em vez de tudo junto como nome do campo.
function FieldShell({
  label,
  required,
  hint,
  hintId,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fp-field">
      <label className="fp-field-label">
        <span className={required ? "fp-label-required" : undefined}>{label}</span>
        {children}
      </label>
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}

// Campo de texto padrão: rótulo em cima, ajuda embaixo, asterisco quando obrigatório.
// Mês: o Firefox e o Safari mostram uma caixa de texto, então o formato vai na dica.
export function Field({ label, hint, required, type, compact, ...input }: FieldProps) {
  const hintId = useId();
  const month = type === "month";
  const monthHint = month && !hint && !compact ? "Formato AAAA-MM, por exemplo 2026-10." : "";
  const text = hint ?? monthHint;
  return (
    <FieldShell label={label} required={required} hint={text} hintId={hintId}>
      <input
        {...input}
        type={type}
        required={required}
        aria-describedby={text ? hintId : undefined}
        className="fp-input"
        {...(month ? { placeholder: "AAAA-MM", pattern: "\\d{4}-\\d{2}" } : {})}
      />
    </FieldShell>
  );
}

type SelectFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  options: [string, string][];
  hint?: string;
};

export function SelectField({
  label,
  name,
  defaultValue,
  required,
  options,
  hint,
}: SelectFieldProps) {
  const hintId = useId();
  return (
    <FieldShell label={label} required={required} hint={hint} hintId={hintId}>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        aria-describedby={hint ? hintId : undefined}
        className="fp-input"
      >
        {options.map(([value, text]) => (
          <option value={value} key={value}>
            {text}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

type TextAreaFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  hint?: string;
  placeholder?: string;
};

export function TextAreaField({ label, rows = 3, hint, required, ...input }: TextAreaFieldProps) {
  const hintId = useId();
  return (
    <FieldShell label={label} required={required} hint={hint} hintId={hintId}>
      <textarea
        {...input}
        required={required}
        rows={rows}
        aria-describedby={hint ? hintId : undefined}
        className="fp-input"
      />
    </FieldShell>
  );
}

type PaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  path: string;
  query?: Record<string, string>;
};

export function Pagination({ total, page, pageSize, path, query = {} }: PaginationProps) {
  const url = (number: number) =>
    `${path}?${new URLSearchParams({ ...query, page: String(number) })}`;
  return (
    <div className="my-6 flex gap-5 text-sm">
      <span>
        {total} registro(s) · Página {page}
      </span>
      {page > 1 && (
        <a href={url(page - 1)} className="text-primary underline">
          Anterior
        </a>
      )}
      {page * pageSize < total && (
        <a href={url(page + 1)} className="text-primary underline">
          Próxima
        </a>
      )}
    </div>
  );
}
