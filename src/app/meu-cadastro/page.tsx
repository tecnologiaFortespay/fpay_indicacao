import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { KeyValueStrip } from "@/components/key-value-strip";
import { PanelBody, SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import { competencyLabel, currentCompetency, dateToCompetency, formatDate } from "@/lib/competency";
import { partnerKindLabels } from "@/lib/labels";
import { formatCurrency } from "@/lib/money";
import { getPartner, listPartnerRules } from "@/lib/partners/queries";
import { currentRule, ruleSentence } from "@/lib/referrals/config";

export const metadata: Metadata = { title: "Meu cadastro" };

// Ficha do próprio parceiro, só leitura: dados do cadastro e regra definida pela Fortes Pay.
export default async function MyRegistrationPage() {
  const user = await requireRole("partner");
  const partnerId = user.profile.partner?.id ?? "";
  const [partner, rules] = await Promise.all([getPartner(partnerId), listPartnerRules(partnerId)]);
  if (!partner) {
    notFound();
  }
  const kind = partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind;
  const place = partner.city ? `${partner.city}${partner.state ? `/${partner.state}` : ""}` : "—";
  const today = currentCompetency();
  const rule = currentRule(rules, today);
  return (
    <AppShell title="Meu cadastro">
      <KeyValueStrip
        facts={[
          ["Nome", partner.name],
          ["Tipo", kind],
          ["Local", place],
          ["Responsável", partner.contact_name ?? "—"],
          ["E-mail", partner.contact_email ?? "—"],
          ["Telefone", partner.contact_phone ?? "—"],
          ["Aprovado em", partner.approved_at ? formatDate(partner.approved_at) : "—"],
        ]}
      />
      <SectionCard
        title="Minha regra de remuneração"
        subtitle="Definida pela Fortes Pay. Cada indicação segue a regra de quando foi feita, salvo valor e prazo próprios combinados com a Fortes Pay."
        footnote="Uma regra nova vale do mês dela em diante; meses já fechados não mudam. Uma indicação pode ter valor e prazo próprios, combinados com a Fortes Pay: eles aparecem em Meu painel. Para corrigir algum dado, fale com a Fortes Pay."
      >
        {rule && (
          <PanelBody>
            <p className="fp-sentence">
              Hoje: <strong>{ruleSentence(rule, today)}</strong>
            </p>
          </PanelBody>
        )}
        {rules.length === 0 ? (
          <EmptyState title="Nenhuma regra cadastrada" />
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Vale a partir de</th>
                  <th className="fp-num">Valor por vida</th>
                  <th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((item) => (
                  <tr key={item.id}>
                    <td>{competencyLabel(dateToCompetency(item.valid_from))}</td>
                    <td className="fp-num">{formatCurrency(item.value_per_life)}</td>
                    <td>
                      {item.term_months === null
                        ? "sem prazo"
                        : `${item.term_months} meses por cliente, a partir do 1º pagamento`}
                    </td>
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
