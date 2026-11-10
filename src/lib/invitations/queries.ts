import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Invitation = Tables<"invitations">;

// Segredo gerado com randomBytes(32).toString("base64url") = 43 caracteres.
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;

// Convites de parceiro (unidade, parceiro externo) e de diretor (Equipe, decisão 19).
export const INVITATION_KINDS = ["unit", "external", "director"] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

const previewSchema = z.object({
  partner_name: z.string(),
  kind: z.enum(INVITATION_KINDS),
  expires_at: z.string(),
  status: z.enum(["open", "used", "expired"]),
});

export type InvitationPreview = z.infer<typeof previewSchema>;

// Validade padrão de um convite novo: sete dias, como o diretor lê no formulário.
export function defaultInvitationValidUntil(): string {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + sevenDays).toISOString().slice(0, 10);
}

export async function listInvitations(kinds: InvitationKind[]): Promise<Invitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .in("kind", kinds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error("Não foi possível consultar os convites.");
  }
  return data;
}

export async function invitationPreview(secret: string): Promise<InvitationPreview | null> {
  if (!INVITATION_TOKEN_PATTERN.test(secret)) {
    return null;
  }
  const supabase = await createClient();
  const result = await supabase.rpc("invitation_preview", { secret });
  if (result.error || result.data === null) {
    return null;
  }
  return previewSchema.parse(result.data);
}

export function invitationStatus(invitation: Invitation): "open" | "used" | "expired" {
  if (invitation.used_at) {
    return "used";
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return "expired";
  }
  return "open";
}
