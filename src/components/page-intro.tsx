import { MonthPicker, type MonthPickerProps } from "./month-picker";

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
