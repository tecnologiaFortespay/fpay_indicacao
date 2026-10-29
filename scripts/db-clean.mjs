// Zera os dados do Supabase LOCAL (tests/reset-data.sql): parceiros, indicações, importações,
// fechamentos e usuários. Só alcança o contêiner local; o projeto da Fortes Pay não é tocado.
// Uso: npm run db:clean
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_fpay_indicacao";
execSync(`docker exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f -`, {
  input: readFileSync("tests/reset-data.sql"),
  stdio: ["pipe", "inherit", "inherit"],
});
console.log("Banco local zerado. Crie diretor e analista com npm run bootstrap:local.");
