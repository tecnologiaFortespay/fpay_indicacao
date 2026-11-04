type SectionCardProps = {
  title: string;
  subtitle?: React.ReactNode;
  // Link ou botão à direita do título (ex.: "Ver todos →").
  action?: React.ReactNode;
  footnote?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
};

// Cartão de seção: título, subtítulo de uma linha, conteúdo e rodapé opcional.
// O conteúdo decide o próprio espaçamento: tabelas encostam na borda, textos usam .fp-panel-body.
export function SectionCard({ title, subtitle, action, footnote, children, id }: SectionCardProps) {
  return (
    <section className="fp-panel" aria-label={title} id={id}>
      <header className="fp-panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
      {footnote && <p className="fp-panel-footnote">{footnote}</p>}
    </section>
  );
}

export function PanelBody({ children }: { children: React.ReactNode }) {
  return <div className="fp-panel-body">{children}</div>;
}
