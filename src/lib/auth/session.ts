import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { authConfig } from "@/lib/env";
import type { FormState } from "@/lib/auth/validation";
import type { Role } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(["director", "partner"]),
  display_name: z.string(),
  partner: z
    .object({
      id: z.uuid(),
      name: z.string(),
      status: z.enum(["pending", "active", "rejected"]),
      rejection_reason: z.string().nullable(),
    })
    .nullable(),
});

export type Profile = z.infer<typeof profileSchema>;

export type SessionUser = {
  userId: string;
  email: string;
  profile: Profile | null;
};

export type AuthorizedUser = SessionUser & { profile: Profile };

// Deduplicated per render by React cache; nothing persists between requests.
// connection() keeps every page that checks the session dynamic: without it, a build made without
// the Supabase variables would prerender pages as "no session" and redirect forever at runtime.
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  await connection();
  if (!authConfig()) {
    return null;
  }
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return null;
  }
  const result = await supabase.rpc("current_profile");
  if (result.error) {
    throw new Error("Não foi possível consultar o perfil de acesso. Tente novamente.");
  }
  const profile = result.data === null ? null : profileSchema.parse(result.data);
  return { userId: user.id, email: user.email ?? "", profile };
});

export function hasAccess(user: SessionUser): user is AuthorizedUser {
  if (!user.profile) {
    return false;
  }
  if (user.profile.role === "partner") {
    return user.profile.partner?.status === "active";
  }
  return true;
}

export function landingPath(user: SessionUser): string {
  if (!user.profile) {
    return "/sem-acesso";
  }
  if (user.profile.role === "partner" && user.profile.partner?.status !== "active") {
    return "/cadastro-em-analise";
  }
  return "/inicio";
}

export async function requireUser(): Promise<AuthorizedUser> {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }
  if (!hasAccess(user)) {
    redirect(landingPath(user));
  }
  return user;
}

export async function requireRole(...roles: Role[]): Promise<AuthorizedUser> {
  const user = await requireUser();
  if (!roles.includes(user.profile.role)) {
    redirect(landingPath(user));
  }
  return user;
}

export async function actionUser(...roles: Role[]): Promise<AuthorizedUser | null> {
  const user = await currentUser();
  if (!user || !hasAccess(user)) {
    return null;
  }
  if (!roles.includes(user.profile.role)) {
    return null;
  }
  return user;
}

// Resposta de uma ação recusada: sessão expirada (manda entrar de novo) ou perfil sem permissão.
export async function deniedState(
  message = "Você não tem permissão para esta operação.",
): Promise<FormState> {
  const user = await currentUser();
  if (!user) {
    return {
      error: "Sua sessão expirou. Entre de novo para continuar.",
      destination: "/login?motivo=sessao",
    };
  }
  return { error: message };
}
