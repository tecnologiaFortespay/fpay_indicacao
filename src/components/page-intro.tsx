import { Field } from "./fields";
import { Button } from "./ui/button";

type MonthPickerProps = {
  value: string;
  label?: string;
  // Outros parâmetros da página que precisam continuar na URL ao trocar o mês.
  keep?: Record<string, string>;
};

// Seletor de mês por GET: a página relê os dados do mês escolhido.
export function MonthPicker({ value, label = "Mês", keep = {} }: MonthPickerProps) {
  return (
    <form className="fp-month-picker">
      {Object.entries(keep).map(([name, keptValue]) => (
        <input key={name} type="hidden" name={name} value={keptValue} />
      ))}
      <Field name="competency" label={label} type="month" defaultValue={value} required compact />
      <Button type="submit" variant="outline">
        Ver mês
      </Button>
    </form>
  );
}

type PageIntroProps = {
  children: React.ReactNode;
  month?: MonthPickerProps;
};

// Primeira linha da página: para que ela serve, em uma frase, e o mês quando a página depende dele.
export function PageIntro({ children, month }: PageIntroProps) {
  return (
    <div className="fp-page-intro">
      <p>{children}</p>
      {month && <MonthPicker {...month} />}
    </div>
  );
}
