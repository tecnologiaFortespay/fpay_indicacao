import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="fp-auth-form-panel min-h-dvh">
      <div className="fp-auth-card space-y-4">
        <header>
          <h1>Página não encontrada</h1>
          <p>
            Este endereço não existe ou não está disponível para o seu acesso. Confira o link ou
            volte ao início.
          </p>
        </header>
        <Link href="/" className={buttonVariants({ variant: "default" })}>
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
