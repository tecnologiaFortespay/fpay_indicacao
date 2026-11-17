import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { OrbitaIcon } from "@/components/orbita-icon";
import { PageIntro } from "@/components/page-intro";
import { SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import { currentCompetency, formatDate } from "@/lib/competency";
import { appOrigin } from "@/lib/env";
import { partnerKindLabels } from "@/lib/labels";
import { listAllRules, listPartners, type Partner } from "@/lib/partners/queries";
import { currentRule, ruleSentence } from "@/lib/referrals/config";

export const metadata: Metadata = { title: "Parceiros" };

// O tipo é escolhido pelo diretor na aprovação; antes disso o cadastro não tem tipo.
function kindOf(partner: Partner): string {
  return partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind ?? "—";
}

function placeOf(partner: Partner): string {
  if (!partner.city) {
    return "—";
  }
  return partner.state ? `${partner.city}/${partner.state}` : partner.city;
}

function PendingRow({ partner }: { partner: Partner }) {
  return (
    <Link className="fp-action-row" href={`/parceiros/${partner.id}`}>
      <span>
        <strong>{partner.name}</strong>
        <small>
          {placeOf(partner)}
          {partner.contact_name ? ` · ${partner.contact_name}` : ""} · cadastrado em{" "}
          {formatDate(partner.created_at)}
        </small>
      </span>
      <span className="fp-action-label">
        Analisar e aprovar
        <OrbitaIcon name="arrow" />
      </span>
    </Link>
  );
}

export default async function PartnersPage() {
  await requireRole("director");
  const [partners, rules] = await Promise.all([listPartners(), listAllRules()]);
  const today = currentCompetency();
  // Endereço que o diretor pode mandar ao parceiro (WhatsApp, e-mail) para ele criar a conta.
  const signupAddress = `${appOrigin(await headers())}/cadastro`;
  const pending = partners.filter((partner) => partner.status === "pending");
  const active = partners.filter((partner) => partner.status === "active");
  const rejected = partners.filter((partner) => partner.status === "rejected");
  return (
    <AppShell title="Parceiros">
      <PageIntro>
        Unidades e parceiros externos que indicam clientes. O parceiro novo cria a própria conta em
        “Criar conta de parceiro”, na tela de entrada do sistema; o cadastro aparece aqui e você
        aprova escolhendo o tipo e quanto ele recebe por vida.
      </PageIntro>

      <SectionCard
        title={`Aguardando aprovação (${pending.length})`}
        subtitle="Cadastros feitos pelo próprio parceiro em “Criar conta de parceiro”. Ele só entra no sistema depois que você aprova."
        footnote={
          <>
            Endereço direto do cadastro, para enviar ao parceiro:{" "}
            <span className="fp-num break-all">{signupAddress}</span>
          </>
        }
      >
        {pending.length === 0 ? (
          <EmptyState title="Nenhum cadastro aguardando">
            Peça ao parceiro para abrir o sistema e clicar em “Criar conta de parceiro”. Quando ele
            enviar o cadastro, aparece aqui para você aprovar.
          </EmptyState>
        ) : (
          pending.map((partner) => <PendingRow key={partner.id} partner={partner} />)
        )}
      </SectionCard>

      <SectionCard
        title={`Ativos (${active.length})`}
        subtitle="Parceiros aprovados, com acesso ao portal."
      >
        {active.length === 0 ? (
          <EmptyState title="Nenhum parceiro aprovado ainda" />
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th>Tipo</th>
                  <th>Local</th>
                  <th>Responsável</th>
                  <th>Regra hoje</th>
                </tr>
              </thead>
              <tbody>
                {active.map((partner) => {
                  const rule = currentRule(
                    rules.filter((item) => item.partner_id === partner.id),
                    today,
                  );
                  return (
                    <tr key={partner.id}>
                      <td>
                        <Link href={`/parceiros/${partner.id}`}>{partner.name}</Link>
                      </td>
                      <td>{kindOf(partner)}</td>
                      <td>{placeOf(partner)}</td>
                      <td>{partner.contact_name ?? "—"}</td>
                      <td>{rule ? ruleSentence(rule, today) : "sem regra"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {rejected.length > 0 && (
        <SectionCard
          title={`Recusados (${rejected.length})`}
          subtitle="Sem acesso. Abra para ver o motivo ou reconsiderar."
        >
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th>Tipo</th>
                  <th>Motivo da recusa</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map((partner) => (
                  <tr key={partner.id}>
                    <td>
                      <Link href={`/parceiros/${partner.id}`}>{partner.name}</Link>
                    </td>
                    <td>{kindOf(partner)}</td>
                    <td>{partner.rejection_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </AppShell>
  );
}
