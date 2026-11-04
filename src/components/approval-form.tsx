import { Field, TextAreaField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { approvePartner, rejectPartner } from "@/app/parceiros/actions";
import { currentCompetency } from "@/lib/competency";
import { glossary } from "@/lib/glossary";
import type { Partner } from "@/lib/partners/queries";

// Aprovação exige a regra do parceiro (valor por vida e início; prazo opcional). Não há parceiro
// ativo sem regra. Cada indicação pode ter depois valor e prazo próprios.
export function ApprovalForm({ partner, label }: { partner: Partner; label: string }) {
  return (
    <MutationForm action={approvePartner} label={label} pendingLabel="Aprovando…">
      <input type="hidden" name="partner_id" value={partner.id} />
      <div className="fp-form-grid fp-form-grid-3">
        <Field
          label={glossary.valuePerLife.label}
          name="value_per_life"
          required
          placeholder="1,50"
          inputMode="decimal"
          hint={glossary.valuePerLife.hint}
        />
        <Field
          label={glossary.validFrom.label}
          name="valid_from"
          type="month"
          required
          defaultValue={currentCompetency()}
          hint="Mês em que a regra começa. Para contar vidas de meses já enviados do BI, escolha o primeiro desses meses."
        />
        <Field
          label={glossary.termMonths.label}
          name="term_months"
          type="number"
          min={1}
          max={120}
          hint={glossary.termMonths.hint}
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
        label="Motivo da recusa"
        name="reason"
        required
        maxLength={1000}
        hint="O parceiro vê este texto quando entrar."
      />
    </MutationForm>
  );
}
