import { Field, TextAreaField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { approvePartner, rejectPartner } from "@/app/parceiros/actions";
import { currentCompetency } from "@/lib/competency";
import type { Partner } from "@/lib/partners/queries";

// Aprovação exige a regra do parceiro (valor por vida e vigência; prazo opcional). Não há parceiro
// ativo sem regra. Cada indicação pode ter depois valor e prazo próprios.
export function ApprovalForm({ partner }: { partner: Partner }) {
  return (
    <MutationForm action={approvePartner} label="Aprovar cadastro" pendingLabel="Aprovando…">
      <input type="hidden" name="partner_id" value={partner.id} />
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
          hint="Em branco = sem prazo. Com prazo, cada indicação conta só os primeiros N meses após o primeiro pagamento (ex.: contador, 12 meses)."
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
