import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/notice";

export const metadata: Metadata = { title: "Esqueci minha senha" };

type PageProps = { searchParams: Promise<{ erro?: string }> };

// Sem e-mail (decisão 19): a nova senha sai por um link que um diretor da Fortes Pay gera e envia.
// A página só explica o caminho; não há formulário nem promessa de e-mail.
export default async function RecoveryPage({ searchParams }: PageProps) {
  const { erro } = await searchParams;
  return (
    <AuthShell
      title="Esqueci minha senha"
      description="A nova senha sai por um link gerado por um diretor da Fortes Pay. O sistema não envia e-mail."
    >
      {erro === "sessao" && (
        <Notice tone="warning" role="status" compact>
          O link de nova senha expirou ou já foi usado. Peça um novo.
        </Notice>
      )}
      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li>
          <strong>Parceiro:</strong> peça à Fortes Pay. O diretor gera o link na sua ficha e envia a
          você por WhatsApp ou e-mail.
        </li>
        <li>
          <strong>Diretor:</strong> peça a outro diretor. Ele gera o link em Equipe.
        </li>
        <li>
          O link vale por 24 horas e uma única vez. Ao abrir, você define a senha nova e entra.
        </li>
      </ul>
      <Link href="/login" className="text-sm text-primary underline">
        Voltar ao login
      </Link>
    </AuthShell>
  );
}
