"use client";

// Erro no próprio layout: a página fica sem os estilos globais, então o visual vai inline.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f2f2f0",
          color: "#1c1d20",
        }}
      >
        <title>Erro · Fortes Pay</title>
        <div
          style={{
            maxWidth: 440,
            padding: 30,
            background: "#fff",
            border: "1px solid #c4c4bf",
            borderRadius: 16,
          }}
        >
          <h1 style={{ fontSize: 24, margin: "0 0 10px" }}>Algo deu errado</h1>
          <p style={{ margin: "0 0 18px", color: "#4f5258" }}>
            O sistema não conseguiu carregar. Tente de novo em instantes; se continuar, avise a
            Fortes Pay e informe o código abaixo.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              padding: "9px 16px",
              border: 0,
              borderRadius: 9,
              background: "#cc0000",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Tentar de novo
          </button>
          {digest && (
            <p style={{ marginTop: 16, fontSize: 12, color: "#6a6d73" }}>Código: {digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
