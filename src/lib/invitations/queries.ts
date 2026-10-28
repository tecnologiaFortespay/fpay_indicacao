import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Invitation = Tables<"invitations">;

// Segredo gerado com randomBytes(32).toString("base64url") = 43 caracteres.
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;

const previewSchema = z.object({
  partner_name: z.string(),
  kind: z.enum(["unit", "external"]),
  expires_at: z.string(),
  status: z.enum(["open", "used", "expired"]),
});

export type InvitationPreview = z.infer<typeof previewSchema>;

export async function listInvitations(): Promise<Invitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
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
