type Fact = [label: string, value: React.ReactNode];

// Faixa de dados de um registro (ficha do parceiro, indicação, envio): rótulo pequeno, valor legível.
export function KeyValueStrip({ facts }: { facts: Fact[] }) {
  return (
    <dl className="fp-facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
