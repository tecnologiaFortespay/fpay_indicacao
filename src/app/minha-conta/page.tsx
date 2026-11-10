import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Field } from "@/components/fields";
import { KeyValueStrip } from "@/components/key-value-strip";
import { MutationForm } from "@/components/mutation-form";
import { PanelBody, SectionCard } from "@/components/section-card";
import { requireUser } from "@/lib/auth/session";
import { roleLabels } from "@/lib/labels";
import { changePassword } from "./actions";

export const metadata: Metadata = { title: "Minha conta" };

// Dados de acesso da pessoa conectada e troca da própria senha (decisão 19). Vale para os dois
// perfis; quem esqueceu a senha atual pede o link de nova senha a um diretor.
export default async function MyAccountPage() {
  const user = await requireUser();
  const partner = user.profile.partner;
  const roleLabel = partner ? `${roleLabels.partner} · ${partner.name}` : roleLabels.director;
  const forgotten =
    user.profile.role === "director"
      ? "Esqueceu a senha atual? Peça a outro diretor um link de nova senha, em Equipe."
      : "Esqueceu a senha atual? Peça à Fortes Pay um link de nova senha.";
  return (
    <AppShell title="Minha conta">
      <KeyValueStrip
        facts={[
          ["Nome", user.profile.display_name],
          ["E-mail de acesso", user.email],
          ["Perfil", roleLabel],
        ]}
      />
      <SectionCard
        title="Alterar senha"
        subtitle="Informe a senha atual e escolha a nova. Você continua conectado."
        footnote={forgotten}
      >
        <PanelBody>
          <MutationForm action={changePassword} label="Alterar senha" pendingLabel="Alterando…">
            <Field
              label="Senha atual"
              name="current_password"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
            />
            <div className="fp-form-grid">
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
            </div>
          </MutationForm>
        </PanelBody>
      </SectionCard>
    </AppShell>
  );
}
