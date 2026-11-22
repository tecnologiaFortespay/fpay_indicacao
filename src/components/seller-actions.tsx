import { setSellerStatus } from "@/app/parceiros/actions";
import type { Seller } from "@/lib/partners/queries";
import { MutationForm } from "./mutation-form";

type SellerActionsProps = {
  seller: Seller;
  // De onde a ação foi pedida: a lista de Parceiros ou a ficha da unidade (para onde ela volta).
  returnTo: "list" | "partner";
};

function StatusButton({
  seller,
  returnTo,
  status,
  label,
  variant,
}: SellerActionsProps & {
  status: "active" | "rejected";
  label: string;
  variant: "default" | "outline" | "destructive";
}) {
  return (
    <MutationForm
      action={setSellerStatus}
      label={label}
      pendingLabel="Salvando…"
      variant={variant}
      size="sm"
      inline
    >
      <input type="hidden" name="user_id" value={seller.user_id} />
      <input type="hidden" name="partner_id" value={seller.partner_id} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="status" value={status} />
    </MutationForm>
  );
}

// O que o diretor pode fazer com o acesso do vendedor (decisão 29): aprovar ou recusar o pedido,
// remover o acesso de quem já tem e liberar de novo quem ficou sem.
export function SellerActions({ seller, returnTo }: SellerActionsProps) {
  if (seller.status === "pending") {
    return (
      <div className="flex flex-wrap gap-2">
        <StatusButton
          seller={seller}
          returnTo={returnTo}
          status="active"
          label="Aprovar vendedor"
          variant="default"
        />
        <StatusButton
          seller={seller}
          returnTo={returnTo}
          status="rejected"
          label="Recusar pedido"
          variant="outline"
        />
      </div>
    );
  }
  if (seller.status === "active") {
    return (
      <StatusButton
        seller={seller}
        returnTo={returnTo}
        status="rejected"
        label="Remover acesso"
        variant="outline"
      />
    );
  }
  return (
    <StatusButton
      seller={seller}
      returnTo={returnTo}
      status="active"
      label="Liberar acesso"
      variant="outline"
    />
  );
}
