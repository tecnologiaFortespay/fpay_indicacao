import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/session";
import { competencyLabel, dateToCompetency, formatDate } from "@/lib/competency";
import { partnerKindLabels } from "@/lib/labels";
import { formatCurrency } from "@/lib/money";
import { getPartner, listPartnerRules } from "@/lib/partners/queries";

export const metadata: Metadata = { title: "Meu cadastro" };

// Ficha do próprio parceiro, só leitura: dados do cadastro e regras definidas pela Fortes Pay.
export default async function MyRegistrationPage() {
  const user = await requireRole("partner");
  const partnerId = user.profile.partner?.id ?? "";
  const [partner, rules] = await Promise.all([getPartner(partnerId), listPartnerRules(partnerId)]);
  if (!partner) {
    notFound();
  }
  const kind = partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind;
  const place = partner.city ? `${partner.city}${partner.state ? `/${partner.state}` : ""}` : "—";
  return (
    <AppShell title="Meu cadastro">
      <div className="fp-detail-total">
        <div>
          <span>Nome</span>
          <strong className="text-base">{partner.name}</strong>
        </div>
        <div>
          <span>Tipo</span>
          <strong className="text-base">{kind}</strong>
        </div>
        <div>
          <span>Local</span>
          <strong className="text-base">{place}</strong>
        </div>
        <div>
          <span>Responsável</span>
          <strong className="text-base">{partner.contact_name ?? "—"}</strong>
        </div>
        <div>
          <span>E-mail</span>
          <strong className="text-base break-all">{partner.contact_email ?? "—"}</strong>
        </div>
        <div>
          <span>Telefone</span>
          <strong className="text-base">{partner.contact_phone ?? "—"}</strong>
        </div>
        <div>
          <span>Aprovado em</span>
          <strong className="text-base">
            {partner.approved_at ? formatDate(partner.approved_at) : "—"}
          </strong>
        </div>
      </div>
      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Minha regra de remuneração</h2>
          <span>definida pela Fortes Pay</span>
        </div>
        {rules.length === 0 ? (
          <p className="fp-panel-footnote">Nenhuma regra cadastrada.</p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Vigência a partir de</th>
                  <th className="fp-num">Valor por vida</th>
                  <th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{competencyLabel(dateToCompetency(rule.valid_from))}</td>
                    <td className="fp-num">{formatCurrency(rule.value_per_life)}</td>
                    <td>
                      {rule.term_months === null
                        ? "sem prazo"
                        : `${rule.term_months} meses por cliente, a partir do 1º pagamento`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fp-panel-footnote">
          Cada vigência vale do mês dela em diante. Uma indicação pode ter valor e prazo próprios,
          combinados com a Fortes Pay; eles aparecem em Meu painel. Para corrigir algum dado, fale
          com a Fortes Pay.
        </p>
      </section>
    </AppShell>
  );
}
