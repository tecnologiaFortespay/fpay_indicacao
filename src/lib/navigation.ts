import type { Role } from "@/lib/labels";

export type NavArea = {
  id: string;
  href: string;
  label: string;
  icon: string;
};

// Apresentação apenas. A autorização real fica em requireRole() e na RLS.
export function navigationFor(role: Role): NavArea[] {
  if (role === "analyst") {
    return [{ id: "imports", href: "/importacoes", label: "Importações", icon: "calculation" }];
  }
  if (role === "partner") {
    return [
      { id: "overview", href: "/inicio", label: "Meu painel", icon: "home" },
      { id: "referrals", href: "/indicacoes", label: "Minhas indicações", icon: "commercial" },
    ];
  }
  return [
    { id: "overview", href: "/inicio", label: "Visão geral", icon: "home" },
    { id: "partners", href: "/parceiros", label: "Parceiros", icon: "people" },
    { id: "referrals", href: "/indicacoes", label: "Indicações", icon: "commercial" },
    { id: "imports", href: "/importacoes", label: "Importações", icon: "calculation" },
    { id: "closing", href: "/fechamento", label: "Fechamento do mês", icon: "finance" },
  ];
}

export function matchesPath(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}
