// Roda um comando (ex.: next dev) contra o Supabase LOCAL (.env.test), mesmo com o .env.local
// apontando para o projeto da Fortes Pay. Usado para seguir o roteiro de validação à mão.
// Uso: npm run dev:local
import { spawnSync } from "node:child_process";

process.loadEnvFile(".env.test");
const env = {
  ...process.env,
  NEXT_PUBLIC_ENVIRONMENT_LABEL: "Local",
};
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Informe o comando, por exemplo: node scripts/local.mjs next dev");
  process.exit(1);
}
const result = spawnSync(command, args, { stdio: "inherit", env });
process.exit(result.status ?? 1);
