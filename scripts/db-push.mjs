// Aplica as migrations de supabase/migrations no banco apontado por SUPABASE_DB_URL (.env.local).
// Uso: npm run db:push            (aplica o que falta)
//      npm run db:push -- --dry-run (só lista o que seria aplicado)
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Defina SUPABASE_DB_URL em .env.local (pooler em modo sessão, porta 5432).");
  process.exit(1);
}
// A CLI do Supabase roda direto pelo Node, sem shell: funciona igual no Mac e no Windows e a
// senha em percent-encoding não passa pelo cmd.exe (que trataria %...% como variável).
const require = createRequire(import.meta.url);
const supabasePackage = require.resolve("supabase/package.json");
const cli = join(dirname(supabasePackage), require(supabasePackage).bin.supabase);
const args = [cli, "db", "push", "--db-url", url, ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
