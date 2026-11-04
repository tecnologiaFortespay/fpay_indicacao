import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { formatDateTime } from "@/lib/competency";
import { INVITATION_TOKEN_PATTERN } from "@/lib/invitations/queries";
import { createClient } from "@/lib/supabase/server";
import { resetWithLink } from "./actions";

export const metadata: Metadata = { title: "Nova senha" };

type PageProps = { params: Promise<{ token: string }> };

const previewSchema = z.object({
  display_name: z.string(),
  email: z.string(),
  expires_at: z.string(),
});

// Link de nova senha gerado pelo diretor na ficha do parceiro. Não exige login.
export default async function ResetLinkPage({ params }: PageProps) {
  const { token } = await params;
  const preview = INVITATION_TOKEN_PATTERN.test(token)
    ? await (await createClient()).rpc("password_reset_preview", { secret: token })
    : null;
  const account = preview?.data ? previewSchema.safeParse(preview.data) : null;
  if (!account?.success) {
    return (
      <AuthShell
        title="Link inválido ou expirado"
        description="Este link de nova senha não vale mais: expirou, já foi usado ou foi substituído por outro."
      >
        <p className="text-sm">Peça um novo link à Fortes Pay.</p>
        <Link href="/login" className="text-primary underline">
          Entrar
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Definir nova senha"
      description={`${account.data.display_name} · ${account.data.email}. Link válido até ${formatDateTime(account.data.expires_at)}.`}
    >
      <MutationForm action={resetWithLink} label="Salvar nova senha">
        <input type="hidden" name="token" value={token} />
        <Field
          label="Nova senha (mínimo de 8 caracteres)"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
        <Field
          label="Confirme a nova senha"
          name="confirmation"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </MutationForm>
    </AuthShell>
  );
}
