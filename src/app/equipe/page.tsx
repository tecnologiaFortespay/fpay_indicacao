import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field } from "@/components/fields";
import { FormDisclosure } from "@/components/form-disclosure";
import { MutationForm } from "@/components/mutation-form";
import { PageIntro } from "@/components/page-intro";
import { SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/competency";
import {
  defaultInvitationValidUntil,
  invitationStatus,
  listInvitations,
} from "@/lib/invitations/queries";
import { invitationStatusLabels } from "@/lib/labels";
import { listDirectors } from "@/lib/team/queries";
import { createDirectorInvitation, createDirectorPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Equipe" };

// Quem acessa a área interna: diretores iguais entre si (decisão 19). Convite e link de nova
// senha seguem o mesmo jeito do parceiro: o diretor copia o link e envia; o sistema não manda e-mail.
export default async function TeamPage() {
  const user = await requireRole("director");
  const [directors, invitations] = await Promise.all([
    listDirectors(),
    listInvitations(["director"]),
  ]);
  return (
    <AppShell title="Equipe">
      <PageIntro>
        Quem acessa a área interna da Fortes Pay. Cada pessoa tem o próprio login de diretor, quem
        envia a planilha do BI também. Convide pelo link e, se alguém esquecer a senha, gere aqui o
        link de nova senha.
      </PageIntro>

      <SectionCard
        title="Diretores"
        subtitle="Todos têm o mesmo acesso: convidam, enviam a planilha, fecham o mês e geram link de nova senha uns para os outros."
        footnote="O link de nova senha vale por 24 horas e uma única vez; gerar outro invalida o anterior. Envie por WhatsApp ou e-mail: o sistema não envia sozinho."
      >
        <div className="fp-table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail de acesso</th>
                <th>Desde</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {directors.map((director) => (
                <tr key={director.user_id}>
                  <td>{director.display_name}</td>
                  <td>{director.email}</td>
                  <td>{formatDate(director.created_at)}</td>
                  <td>
                    {director.user_id === user.userId ? (
                      <Link href="/minha-conta" className="text-sm text-primary underline">
                        Você · trocar a senha em Minha conta
                      </Link>
                    ) : (
                      <MutationForm
                        action={createDirectorPasswordReset}
                        label="Gerar link de nova senha"
                        pendingLabel="Gerando…"
                        variant="outline"
                        size="sm"
                        linkLabel="Link de nova senha"
                      >
                        <input type="hidden" name="user_id" value={director.user_id} />
                      </MutationForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Convites de diretor"
        subtitle="Quem abre o link cria o próprio acesso e entra direto: o convite já é a aprovação."
      >
        <FormDisclosure
          label="Convidar diretor"
          open={invitations.length === 0}
          description="Depois de gerar, copie o link na hora e envie à pessoa por WhatsApp ou e-mail: por segurança ele aparece uma vez só, e o sistema não envia sozinho."
        >
          <MutationForm
            action={createDirectorInvitation}
            label="Gerar convite"
            pendingLabel="Gerando…"
          >
            <div className="fp-form-grid">
              <Field
                label="Nome"
                name="name"
                required
                maxLength={120}
                hint="Aparece no convite; a pessoa pode corrigir no cadastro."
              />
              <Field
                label="Válido até"
                name="valid_until"
                type="date"
                required
                defaultValue={defaultInvitationValidUntil()}
                hint="Até o fim deste dia (horário de Fortaleza)."
              />
            </div>
          </MutationForm>
        </FormDisclosure>
        {invitations.length > 0 && (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Convite para</th>
                  <th>Criado em</th>
                  <th>Válido até</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>{invitation.partner_name}</td>
                    <td>{formatDate(invitation.created_at)}</td>
                    <td>{formatDate(invitation.expires_at)}</td>
                    <td>{invitationStatusLabels[invitationStatus(invitation)]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
