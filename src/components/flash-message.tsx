"use client";

import { useEffect } from "react";
import { flashText } from "@/lib/flash";
import { Notice } from "./notice";

// Mostra a mensagem de ?msg= e tira o parâmetro da barra de endereço, para que recarregar a
// página não repita o aviso.
export function FlashMessage({ code }: { code?: string | null }) {
  const text = flashText(code);
  useEffect(() => {
    if (!text) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("msg");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [text]);
  if (!text) {
    return null;
  }
  return (
    <Notice tone="success" role="status">
      {text}
    </Notice>
  );
}
