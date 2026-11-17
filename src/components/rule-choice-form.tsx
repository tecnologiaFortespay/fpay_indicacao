import { setReferralRule } from "@/app/indicacoes/actions";
import type { RuleChoice } from "@/lib/referrals/rule-choice";
import { MutationForm } from "./mutation-form";

type RuleChoiceFormProps = {
  referralId: string;
  companyName: string;
  choice: RuleChoice;
  // Página para onde a ação volta com o aviso (envio da planilha ou ficha da indicação).
  returnTo: string;
};

// Seletor da vigência do parceiro que vale para a indicação (decisão 27). Usado na tela do envio da
// planilha, dentro da tabela, e na ficha da indicação.
export function RuleChoiceForm({ referralId, companyName, choice, returnTo }: RuleChoiceFormProps) {
  return (
    <MutationForm
      action={setReferralRule}
      label="Aplicar"
      pendingLabel="Aplicando…"
      variant="outline"
      size="sm"
      resetOnSuccess={false}
      inline
    >
      <input type="hidden" name="id" value={referralId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <label>
        <span className="sr-only">Vigência do parceiro para {companyName}</span>
        <select
          name="rule_month"
          defaultValue={choice.selected}
          className="fp-input"
          style={{ minHeight: 32, padding: "4px 8px" }}
        >
          {choice.options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
    </MutationForm>
  );
}
