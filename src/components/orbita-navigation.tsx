"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { matchesPath, type NavArea } from "@/lib/navigation";
import { OrbitaIcon } from "./orbita-icon";
import { LogoutButton } from "./session-controls";

function Brand({ homeHref }: { homeHref: string }) {
  return (
    <Link href={homeHref} className="orbita-brand" aria-label="Fortes Pay — início">
      <Image src="/brand/fp-simbolo.png" alt="" width={36} height={29} priority />
      <span>
        FORTES<b>PAY</b>
        <small>Programa de indicação</small>
      </span>
    </Link>
  );
}

type NavigationProps = {
  areas: NavArea[];
  email: string;
  roleLabel: string;
  homeHref: string;
};

export function OrbitaNavigation({ areas, email, roleLabel, homeHref }: NavigationProps) {
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = areas.find((area) => matchesPath(path, area.href));

  function openMenu() {
    dialog.current?.showModal();
  }

  function closeMenu() {
    dialog.current?.close();
  }

  function renderAreas(mobile: boolean) {
    return (
      <nav
        aria-label={mobile ? "Menu completo" : "Navegação principal"}
        className="orbita-nav fp-simple-nav"
      >
        {areas.map((area) => (
          <Link
            prefetch={false}
            key={area.id}
            href={area.href}
            title={area.label}
            aria-label={area.label}
            aria-current={active?.id === area.id ? "page" : undefined}
            onClick={closeMenu}
          >
            <OrbitaIcon name={area.icon} />
            <span>{area.label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  const footer = (
    <div className="orbita-account">
      <span className="orbita-avatar" aria-hidden="true">
        {email.slice(0, 2).toUpperCase()}
      </span>
      <div className="orbita-account-name">
        <span title={email}>{email}</span>
        <small>{roleLabel}</small>
      </div>
      <LogoutButton />
    </div>
  );

  return (
    <>
      <aside className="orbita-sidebar">
        <Brand homeHref={homeHref} />
        {renderAreas(false)}
        {footer}
      </aside>
      <div className="orbita-mobile-heading">
        <Brand homeHref={homeHref} />
        <button type="button" onClick={openMenu} aria-label="Abrir menu completo">
          <OrbitaIcon name="menu" />
        </button>
      </div>
      <dialog ref={dialog} className="orbita-mobile-dialog" aria-label="Menu de navegação">
        <div className="orbita-dialog-heading">
          <Brand homeHref={homeHref} />
          <button type="button" onClick={closeMenu} aria-label="Fechar menu">
            <OrbitaIcon name="close" />
          </button>
        </div>
        {renderAreas(true)}
        {footer}
      </dialog>
      <nav className="orbita-bottom-nav" aria-label="Navegação rápida">
        {areas.slice(0, 3).map((area) => (
          <Link
            key={area.id}
            href={area.href}
            aria-current={active?.id === area.id ? "page" : undefined}
          >
            <OrbitaIcon name={area.icon} />
            {area.label}
          </Link>
        ))}
        <button type="button" onClick={openMenu}>
          <OrbitaIcon name="menu" />
          Menu
        </button>
      </nav>
    </>
  );
}

const THEME_KEY = "fortes-pay-theme";

export function ThemeButton() {
  useEffect(() => {
    try {
      if (localStorage.getItem(THEME_KEY) === "dark") {
        document.documentElement.dataset.theme = "dark";
      }
    } catch {
      // Sem armazenamento local: fica no tema claro.
    }
  }, []);

  function toggleTheme() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Sem armazenamento local: o tema vale só nesta página.
    }
  }

  return (
    <button
      type="button"
      className="orbita-theme-button"
      aria-label="Alternar tema"
      onClick={toggleTheme}
    >
      <OrbitaIcon name="theme" />
    </button>
  );
}
