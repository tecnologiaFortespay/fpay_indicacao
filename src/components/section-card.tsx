import { InfoTip } from "./info-tip";

type SectionCardProps = {
  title: string;
  subtitle?: React.ReactNode;
  // Texto do "i" de ajuda ao lado do título (src/lib/help.ts).
  info?: string;
  // Link ou botão à direita do título (ex.: "Ver todos →").
  action?: React.ReactNode;
  footnote?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
};

// Cartão de seção: título, subtítulo de uma linha, conteúdo e rodapé opcional.
// O conteúdo decide o próprio espaçamento: tabelas encostam na borda, textos usam .fp-panel-body.
export function SectionCard({
  title,
  subtitle,
  info,
  action,
  footnote,
  children,
  id,
}: SectionCardProps) {
  return (
    <section className="fp-panel" aria-label={title} id={id}>
      <header className="fp-panel-heading">
        <div>
          {info ? (
            <div className="fp-title-row">
              <h2>{title}</h2>
              <InfoTip text={info} />
            </div>
          ) : (
            <h2>{title}</h2>
          )}
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
