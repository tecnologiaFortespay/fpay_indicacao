import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { OrbitaIcon } from "@/components/orbita-icon";
import { PageIntro } from "@/components/page-intro";
import { SectionCard } from "@/components/section-card";
import { SellerActions } from "@/components/seller-actions";
import { requireRole } from "@/lib/auth/session";
import { currentCompetency, formatDate } from "@/lib/competency";
import { appOrigin } from "@/lib/env";
import { help } from "@/lib/help";
import { partnerKindLabels } from "@/lib/labels";
import { listAllRules, listPartners, listSellers, type Partner } from "@/lib/partners/queries";
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

type PageProps = { searchParams: Promise<{ msg?: string }> };

export default async function PartnersPage({ searchParams }: PageProps) {
  await requireRole("director");
  const { msg } = await searchParams;
  const [partners, rules, sellers] = await Promise.all([
    listPartners(),
    listAllRules(),
    listSellers(),
  ]);
  const waitingSellers = sellers.filter((seller) => seller.status === "pending");
  const today = currentCompetency();
  // Endereço que o diretor pode mandar ao parceiro (WhatsApp, e-mail) para ele criar a conta.
  const signupAddress = `${appOrigin(await headers())}/cadastro`;
  const pending = partners.filter((partner) => partner.status === "pending");
  const active = partners.filter((partner) => partner.status === "active");
  const rejected = partners.filter((partner) => partner.status === "rejected");
  return (
    <AppShell title="Parceiros" flash={msg}>
      <PageIntro>
        Unidades e parceiros externos que indicam clientes. O parceiro novo cria a própria conta em
        “Solicitar criação de conta”, na tela de entrada do sistema; o cadastro aparece aqui e você
        aprova escolhendo o tipo e quanto ele recebe por vida.
      </PageIntro>

      <SectionCard
        title={`Aguardando aprovação (${pending.length})`}
        info={help.diretor.parceiros.aguardando}
        subtitle="Cadastros feitos pelo próprio parceiro em “Solicitar criação de conta”. Ele só entra no sistema depois que você aprova."
        footnote={
          <>
            Endereço direto do cadastro, para enviar ao parceiro:{" "}
            <span className="fp-num break-all">{signupAddress}</span>
          </>
        }
      >
        {pending.length === 0 ? (
          <EmptyState title="Nenhum cadastro aguardando">
            Peça ao parceiro para abrir o sistema e clicar em “Solicitar criação de conta”. Quando
            ele enviar o cadastro, aparece aqui para você aprovar.
          </EmptyState>
        ) : (
          pending.map((partner) => <PendingRow key={partner.id} partner={partner} />)
        )}
      </SectionCard>

      {waitingSellers.length > 0 && (
        <SectionCard
          title={`Vendedores pedindo acesso (${waitingSellers.length})`}
          info={help.diretor.parceiros.vendedoresPedindo}
          subtitle="Pedidos feitos em “Solicitar conta de vendedor”. O vendedor só vê e registra as próprias indicações, em nome da unidade; confirme com a unidade antes de aprovar."
        >
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Unidade</th>
                  <th>Pedido em</th>
                  <th>
                    Acesso
                    <InfoTip text={help.diretor.parceiros.acessoDoVendedor} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {waitingSellers.map((seller) => (
                  <tr key={seller.user_id}>
                    <td>
                      {seller.display_name}
                      <small>{seller.email}</small>
                    </td>
                    <td>
                      <Link href={`/parceiros/${seller.partner_id}`}>{seller.partner_name}</Link>
                    </td>
                    <td>{formatDate(seller.created_at)}</td>
                    <td>
                      <SellerActions seller={seller} returnTo="list" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={`Ativos (${active.length})`}
        info={help.diretor.parceiros.ativos}
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
                  <th>
                    Tipo
                    <InfoTip text={help.diretor.parceiros.tipo} />
                  </th>
                  <th>Local</th>
                  <th>Responsável</th>
                  <th>
                    Regra hoje
                    <InfoTip text={help.diretor.parceiros.regraHoje} />
                  </th>
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
          info={help.diretor.parceiros.recusados}
          subtitle="Sem acesso. Abra para ver o motivo ou reconsiderar."
        >
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th>
                    Tipo
                    <InfoTip text={help.diretor.parceiros.tipo} />
                  </th>
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
