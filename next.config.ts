import type { NextConfig } from "next";

// Sem script-src: os scripts inline do Next exigiriam nonce por requisição.
// As diretivas abaixo bloqueiam enquadramento, plugins, troca de base e envio de formulários para outra origem.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Carimbo do build, mostrado no login: diz qual versão está publicada.
  env: { APP_BUILT_AT: new Date().toISOString() },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      // Planilha do BI até 4 MB mais a sobrecarga do multipart (a Vercel corta em 4,5 MB).
      bodySizeLimit: "4.5mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
