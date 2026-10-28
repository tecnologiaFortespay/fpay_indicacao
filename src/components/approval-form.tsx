import { Field, SelectField, TextAreaField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { approvePartner, rejectPartner } from "@/app/parceiros/actions";
import { currentCompetency } from "@/lib/competency";
import { paymentMethodLabels } from "@/lib/labels";
import type { Partner } from "@/lib/partners/queries";

const paymentOptions: [string, string][] = [
  ["", "Selecione"],
  ...(Object.entries(paymentMethodLabels) as [string, string][]),
];

// Aprovação exige regra (valor por vida, vigência, prazo) e meio de pagamento com dados (seção 3 dos requisitos).
export function ApprovalForm({ partner }: { partner: Partner }) {
  return (
    <MutationForm action={approvePartner} label="Aprovar cadastro" pendingLabel="Aprovando…">
      <input type="hidden" name="partner_id" value={partner.id} />
      <h3 className="text-sm font-semibold">Regra de remuneração</h3>
      <div className="fp-form-grid">
        <Field
          label="Valor por vida (R$)"
          name="value_per_life"
          required
          placeholder="1,50"
          inputMode="decimal"
        />
        <Field
          label="Vigência a partir de"
          name="valid_from"
          type="month"
          required
          defaultValue={currentCompetency()}
        />
        <Field
          label="Prazo em meses"
          name="term_months"
          type="number"
          min={1}
          max={120}
          hint="Em branco = sem prazo. Contador: ex. 12 meses por cliente."
        />
      </div>
      <h3 className="text-sm font-semibold">Meio de pagamento</h3>
      <div className="fp-form-grid">
        <SelectField
          label="Meio de pagamento"
          name="payment_method"
          required
          options={paymentOptions}
          defaultValue={partner.payment_method ?? ""}
        />
        <Field
          label="Chave PIX"
          name="pix_key"
          maxLength={120}
          defaultValue={partner.pix_key ?? ""}
        />
        <Field
          label="Banco"
          name="bank_name"
          maxLength={120}
          defaultValue={partner.bank_name ?? ""}
        />
        <Field
          label="Agência"
          name="bank_branch"
          maxLength={20}
          defaultValue={partner.bank_branch ?? ""}
        />
        <Field
          label="Conta"
          name="bank_account"
          maxLength={40}
          defaultValue={partner.bank_account ?? ""}
        />
      </div>
    </MutationForm>
  );
}

export function RejectionForm({ partner }: { partner: Partner }) {
  return (
    <MutationForm
      action={rejectPartner}
      label="Recusar cadastro"
      pendingLabel="Recusando…"
      variant="destructive"
    >
      <input type="hidden" name="partner_id" value={partner.id} />
      <TextAreaField
        label="Motivo da recusa (o parceiro vê este texto)"
        name="reason"
        required
        maxLength={1000}
      />
    </MutationForm>
  );
}
