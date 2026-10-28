import Image from "next/image";
import Link from "next/link";
import { environmentLabel } from "@/lib/env";
import { ThemeButton } from "./orbita-navigation";

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function AuthShell({ title, description, children }: AuthShellProps) {
  const environment = environmentLabel();
  return (
    <main className="fp-auth-shell">
      <aside className="fp-auth-brand-panel">
        <Link prefetch={false} href="/" className="orbita-brand" aria-label="Fortes Pay — início">
          <Image src="/brand/fp-simbolo.png" alt="" width={44} height={35} priority />
          <span>
            FORTES<b>PAY</b>
            <small>Serviços financeiros</small>
          </span>
        </Link>
        <div className="fp-auth-intro">
          <h2>Programa de indicação</h2>
          <p>Indicações, vidas pagas no mês e fechamentos, com a origem de cada número.</p>
        </div>
        {environment && (
          <p className="fp-auth-environment">
            <span />
            Ambiente de {environment.toLocaleLowerCase("pt-BR")}
          </p>
        )}
      </aside>
      <section className="fp-auth-form-panel" aria-label={title}>
        <div className="fp-auth-theme">
          <ThemeButton />
        </div>
        <div className="fp-auth-card">
          <header>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          <div className="space-y-6">{children}</div>
        </div>
        <p className="fp-auth-footnote">Acesso restrito a pessoas autorizadas pela Fortes Pay.</p>
      </section>
    </main>
  );
}
