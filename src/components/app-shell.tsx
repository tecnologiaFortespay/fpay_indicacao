import { landingPath, requireUser } from "@/lib/auth/session";
import { environmentLabel } from "@/lib/env";
import { roleLabels } from "@/lib/labels";
import { navigationFor } from "@/lib/navigation";
import { FlashMessage } from "./flash-message";
import { OrbitaNavigation, ThemeButton } from "./orbita-navigation";
import { SessionGuard } from "./session-controls";

type AppShellProps = {
  title: string;
  children: React.ReactNode;
  // Chave de ?msg= vinda de uma ação que redirecionou para esta página (src/lib/flash.ts).
  flash?: string | null;
};

export async function AppShell({ title, children, flash }: AppShellProps) {
  const user = await requireUser();
  const role = user.profile.role;
  const areas = navigationFor(role);
  const roleLabel = user.profile.partner ? user.profile.partner.name : roleLabels[role];
  const scope = role === "partner" ? "Portal do parceiro" : "Área interna";
  const environment = environmentLabel();
  return (
    <div className="orbita-shell">
      <SessionGuard />
      <a href="#conteudo" className="orbita-skip">
        Ir para o conteúdo
      </a>
      <OrbitaNavigation
        areas={areas}
        email={user.email}
        roleLabel={roleLabel}
        homeHref={landingPath(user)}
      />
      <main id="conteudo" className="orbita-workspace">
        <header className="orbita-toolbar">
          <p>
            {scope}
            <span aria-hidden="true">/</span>
            <strong>{title}</strong>
          </p>
          <div className="orbita-toolbar-actions">
            {environment && <span className="orbita-environment">{environment}</span>}
            <ThemeButton />
          </div>
        </header>
        <div className="orbita-page-heading">
          <h1>{title}</h1>
        </div>
        <div className="orbita-content">
          <FlashMessage code={flash} />
          {children}
        </div>
      </main>
    </div>
  );
}
