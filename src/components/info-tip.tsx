"use client";

import { Popover } from "@base-ui/react/popover";

// "i" de ajuda (decisão 33): passar o mouse, tocar ou apertar Enter abre um balão que explica a
// seção, o número ou a coluna ao lado. Os textos ficam em src/lib/help.ts.
// O balão sai num portal, por cima da página: dentro do cartão (overflow: hidden) ou da tabela com
// rolagem ele seria cortado. O nome do botão é sempre "Ajuda" e o desenho é um SVG, para o título
// ou a coluna ao lado continuarem com o mesmo texto e o mesmo nome para o leitor de tela.
export function InfoTip({ text }: { text: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="fp-info"
        aria-label="Ajuda"
        openOnHover
        delay={120}
        closeDelay={120}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="4.8" r="1" fill="currentColor" />
          <path d="M8 7.4v4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="fp-info-positioner"
          side="top"
          sideOffset={8}
          collisionPadding={12}
        >
          <Popover.Popup className="fp-info-popup" aria-label="Ajuda">
            <Popover.Description render={<p />}>{text}</Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
