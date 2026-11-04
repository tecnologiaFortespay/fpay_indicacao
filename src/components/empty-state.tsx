type EmptyStateProps = {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
};

// O que aparece no lugar de uma lista ou tabela vazia: o que é e o que fazer.
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="fp-empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
