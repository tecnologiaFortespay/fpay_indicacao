import { Field, SelectField } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { savePartner } from "@/app/parceiros/actions";
import { partnerKindLabels } from "@/lib/labels";
import type { Partner } from "@/lib/partners/queries";

const kindOptions = Object.entries(partnerKindLabels) as [string, string][];

export function PartnerForm({ partner }: { partner?: Partner }) {
  return (
    <MutationForm action={savePartner} label={partner ? "Salvar dados" : "Cadastrar parceiro"}>
      <input type="hidden" name="id" value={partner?.id ?? ""} />
      <div className="fp-form-grid">
        <Field
          label="Nome do parceiro (unidade ou pessoa)"
          name="name"
          required
          maxLength={160}
          defaultValue={partner?.name ?? ""}
        />
        <SelectField
          label="Tipo"
          name="kind"
          options={kindOptions}
          defaultValue={partner?.kind ?? "unit"}
        />
        <Field label="Cidade" name="city" maxLength={120} defaultValue={partner?.city ?? ""} />
        <Field
          label="UF"
          name="state"
          maxLength={2}
          placeholder="CE"
          defaultValue={partner?.state ?? ""}
        />
        <Field
          label="Responsável"
          name="contact_name"
          maxLength={160}
          defaultValue={partner?.contact_name ?? ""}
        />
        <Field
          label="E-mail de contato"
          name="contact_email"
          type="email"
          maxLength={254}
          defaultValue={partner?.contact_email ?? ""}
        />
        <Field
          label="Telefone"
          name="contact_phone"
          type="tel"
          maxLength={40}
          defaultValue={partner?.contact_phone ?? ""}
        />
      </div>
    </MutationForm>
  );
}
