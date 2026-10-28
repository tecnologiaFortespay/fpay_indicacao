// Aplica as migrations de supabase/migrations no banco apontado por SUPABASE_DB_URL (.env.local).
// Uso: npm run db:push            (aplica o que falta)
//      npm run db:push -- --dry-run (só lista o que seria aplicado)
import { spawnSync } from "node:child_process";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Defina SUPABASE_DB_URL em .env.local (pooler em modo sessão, porta 5432).");
  process.exit(1);
}
const args = ["supabase", "db", "push", "--db-url", url, ...process.argv.slice(2)];
const result = spawnSync("npx", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
