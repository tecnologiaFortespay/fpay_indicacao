import { InfoTip } from "./info-tip";

// O terceiro item, opcional, é o texto do "i" de ajuda ao lado do rótulo (src/lib/help.ts).
type Fact = [label: string, value: React.ReactNode, info?: string];

// Faixa de dados de um registro (ficha do parceiro, indicação, envio): rótulo pequeno, valor legível.
export function KeyValueStrip({ facts }: { facts: Fact[] }) {
  return (
    <dl className="fp-facts">
      {facts.map(([label, value, info]) => (
        <div key={label}>
          <dt>
            {label}
            {info && <InfoTip text={info} />}
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
