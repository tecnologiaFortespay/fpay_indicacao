import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { OrbitaIcon } from "@/components/orbita-icon";
import { PartnerForm } from "@/components/partner-form";
import { requireRole } from "@/lib/auth/session";
import { partnerKindLabels, partnerStatusLabels, paymentMethodLabels } from "@/lib/labels";
import { listPartners } from "@/lib/partners/queries";

export const metadata: Metadata = { title: "Parceiros" };

function statusClass(status: string): string {
  if (status === "active") {
    return "fp-status fp-status-success";
  }
  if (status === "pending") {
    return "fp-status fp-status-pending";
  }
  return "fp-status";
}

export default async function PartnersPage() {
  await requireRole("director");
  const partners = await listPartners();
  return (
    <AppShell title="Parceiros">
      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Parceiros cadastrados</h2>
          <span>{partners.length} parceiro(s)</span>
        </div>
        {partners.map((partner) => (
          <Link className="fp-action-row" key={partner.id} href={`/parceiros/${partner.id}`}>
            <span>
              <strong>{partner.name}</strong>
              <small>
                {partnerKindLabels[partner.kind as keyof typeof partnerKindLabels] ?? partner.kind}
                {partner.city
                  ? ` · ${partner.city}${partner.state ? `/${partner.state}` : ""}`
                  : ""}
                {partner.payment_method
                  ? ` · ${paymentMethodLabels[partner.payment_method as keyof typeof paymentMethodLabels]}`
                  : ""}
              </small>
            </span>
            <span className="fp-action-label">
              <span className={statusClass(partner.status)}>
                {partnerStatusLabels[partner.status as keyof typeof partnerStatusLabels] ??
                  partner.status}
              </span>
              <OrbitaIcon name="arrow" />
            </span>
          </Link>
        ))}
        {partners.length === 0 && <p className="fp-panel-footnote">Nenhum parceiro cadastrado.</p>}
      </section>
      <details className="fp-disclosure" open={partners.length === 0}>
        <summary>Novo parceiro</summary>
        <section className="fp-panel">
          <div className="fp-form-section">
            <PartnerForm />
          </div>
        </section>
      </details>
    </AppShell>
  );
}
