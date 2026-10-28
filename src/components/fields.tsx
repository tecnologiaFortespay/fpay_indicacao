type FieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
  minLength?: number;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  hint?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel";
};

const inputClass = "block w-full rounded-md border bg-white px-3 py-2 font-normal";

export function Field({ label, hint, ...input }: FieldProps) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      <span>{label}</span>
      <input {...input} className={inputClass} />
      {hint && <small className="block font-normal text-muted-foreground">{hint}</small>}
    </label>
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
  return (
    <label className="block space-y-1 text-sm font-medium">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="block min-h-11 w-full rounded-md border bg-white px-3 py-2 font-normal"
      >
        {options.map(([value, text]) => (
          <option value={value} key={value}>
            {text}
          </option>
        ))}
      </select>
      {hint && <small className="block font-normal text-muted-foreground">{hint}</small>}
    </label>
  );
}

type TextAreaFieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
};

export function TextAreaField({ label, rows = 3, ...input }: TextAreaFieldProps) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      <span>{label}</span>
      <textarea {...input} rows={rows} className={inputClass} />
    </label>
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
