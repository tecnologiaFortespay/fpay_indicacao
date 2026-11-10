import { deletePartnerRule, savePartnerRule } from "@/app/parceiros/actions";
import { competencyLabel, dateToCompetency, shortCompetencyLabel } from "@/lib/competency";
import { glossary } from "@/lib/glossary";
import { formatCurrency } from "@/lib/money";
import type { PartnerRule } from "@/lib/partners/queries";
import { currentRule, ruleSentence } from "@/lib/referrals/config";
import { Field } from "./fields";
import { FormDisclosure } from "./form-disclosure";
import { MutationForm } from "./mutation-form";
import { PanelBody, SectionCard } from "./section-card";

type RulesCardProps = {
  title: string;
  subtitle: string;
  footnote: string;
  // Vigências da mais nova para a mais antiga.
  rules: PartnerRule[];
  partnerId: string;
  // Com referral_id, são as vigências próprias da indicação (valor em branco = o do parceiro).
  referralId?: string;
  today: string;
  // Último mês fechado: vigências até ele não mudam mais.
  lockedThrough: string | null;
  // O que mostrar como "Hoje" quando não há vigência (ex.: a regra do parceiro).
  emptyText: string;
};

function valueText(rule: PartnerRule): string {
  return rule.value_per_life === null ? "valor do parceiro" : formatCurrency(rule.value_per_life);
}

function RuleFields({
  referralId,
  rule,
  today,
}: {
  referralId?: string;
  rule?: PartnerRule;
  today: string;
}) {
  const own = referralId !== undefined;
  return (
    <div className="fp-form-grid fp-form-grid-3">
      <Field
        label={glossary.valuePerLife.label}
        name="value_per_life"
        required={!own}
        inputMode="decimal"
        placeholder={own ? "valor do parceiro" : "1,50"}
        defaultValue={
          rule?.value_per_life === null || rule?.value_per_life === undefined
            ? ""
            : String(rule.value_per_life).replace(".", ",")
        }
        hint={own ? glossary.referralValue.hint : glossary.valuePerLife.hint}
      />
      <Field
        label={glossary.validFrom.label}
        name="valid_from"
        type="month"
        required
        defaultValue={rule ? dateToCompetency(rule.valid_from) : today}
        hint={own ? glossary.referralValidFrom.hint : glossary.validFrom.hint}
      />
      <Field
        label={glossary.termMonths.label}
        name="term_months"
        type="number"
        min={1}
        max={120}
        defaultValue={
          rule?.term_months === null || rule?.term_months === undefined
            ? ""
            : String(rule.term_months)
        }
        hint={own ? glossary.referralTerm.hint : glossary.termMonths.hint}
      />
    </div>
  );
}

// Só a vigência mais recente muda, e só enquanto nenhum mês fechado a usa; as anteriores são histórico.
function EditLatestRule({
  rule,
  partnerId,
  referralId,
  today,
}: {
  rule: PartnerRule;
  partnerId: string;
  referralId?: string;
  today: string;
}) {
  return (
    <FormDisclosure
      label={`Editar a vigência de ${shortCompetencyLabel(dateToCompetency(rule.valid_from))}`}
      description="Corrige a vigência mais recente. Para mudar o valor a partir de um mês, prefira criar uma nova vigência."
    >
      <MutationForm action={savePartnerRule} label="Salvar alteração" resetOnSuccess={false}>
        <input type="hidden" name="id" value={rule.id} />
        <input type="hidden" name="partner_id" value={partnerId} />
        {referralId && <input type="hidden" name="referral_id" value={referralId} />}
        <RuleFields referralId={referralId} rule={rule} today={today} />
      </MutationForm>
      <div className="mt-4">
        <MutationForm
          action={deletePartnerRule}
          label="Remover esta vigência"
          pendingLabel="Removendo…"
          variant="outline"
        >
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="partner_id" value={partnerId} />
          {referralId && <input type="hidden" name="referral_id" value={referralId} />}
        </MutationForm>
      </div>
    </FormDisclosure>
  );
}

// Vigências de um parceiro ou de uma indicação (decisão 23): a regra de hoje numa frase, o
// histórico, a edição da mais recente e a nova vigência. Mesma tela nos dois lugares.
export function RulesCard({
  title,
  subtitle,
  footnote,
  rules,
  partnerId,
  referralId,
  today,
  lockedThrough,
  emptyText,
}: RulesCardProps) {
  const latest = rules[0];
  const latestEditable =
    latest !== undefined &&
    (lockedThrough === null || dateToCompetency(latest.valid_from) > lockedThrough);
  const rule = currentRule(rules, today);
  return (
    <SectionCard title={title} subtitle={subtitle} footnote={footnote}>
      <PanelBody>
        <p className="fp-sentence">
          {rule ? (
            <>
              Hoje: <strong>{ruleSentence(rule, today)}</strong>
            </>
          ) : (
            emptyText
          )}
        </p>
      </PanelBody>
      {rules.length > 0 && (
        <div className="fp-table-wrap">
          <table className="fp-table">
            <thead>
              <tr>
                <th>Vale a partir de</th>
                <th className="fp-num">Valor por vida</th>
                <th>Prazo</th>
                <th>Pode mudar?</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((item) => (
                <tr key={item.id}>
                  <td>{competencyLabel(dateToCompetency(item.valid_from))}</td>
                  <td className="fp-num">{valueText(item)}</td>
                  <td>{item.term_months === null ? "sem prazo" : `${item.term_months} meses`}</td>
                  <td>
                    {item.id !== latest?.id
                      ? "não, histórico"
                      : latestEditable
                        ? "sim, é a mais recente"
                        : "não, já usada em mês fechado"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {latest && latestEditable && (
        <EditLatestRule rule={latest} partnerId={partnerId} referralId={referralId} today={today} />
      )}
      <FormDisclosure
        label="Nova vigência"
        description={
          referralId
            ? "Use quando o valor ou o prazo desta indicação mudar a partir de um mês. Os meses anteriores continuam como estavam."
            : "Use quando o valor ou o prazo mudar a partir de um mês, para quem for indicado a partir dele. Indicações anteriores seguem a regra de quando foram feitas."
        }
      >
        <MutationForm action={savePartnerRule} label="Salvar nova vigência">
          <input type="hidden" name="partner_id" value={partnerId} />
          {referralId && <input type="hidden" name="referral_id" value={referralId} />}
          <RuleFields referralId={referralId} today={today} />
        </MutationForm>
      </FormDisclosure>
    </SectionCard>
  );
}
