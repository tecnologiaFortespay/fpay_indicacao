type NoticeProps = {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  compact?: boolean;
  children?: React.ReactNode;
  // role="status" para avisos que aparecem depois de uma ação; "alert" para erros.
  role?: "status" | "alert";
};

// Aviso com cor por tom. Substitui as caixas soltas (bg-red-50, bg-amber-50...) das telas.
export function Notice({ tone = "info", title, compact, children, role }: NoticeProps) {
  return (
    <div
      role={role}
      className={`fp-notice fp-notice-${tone}${compact ? " fp-notice-compact" : ""}`}
    >
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}
