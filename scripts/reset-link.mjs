// Gera o link de nova senha de um usuário, sem enviar e-mail, para repassar à pessoa (WhatsApp,
// e-mail próprio). Serve enquanto o Supabase não tem a Site URL e o SMTP da Fortes Pay: o link
// aponta para /auth/confirm do sistema, que valida o token sem depender do painel.
// Vale por 1 hora e uma única vez; gerar outro invalida o anterior.
// Uso: npm run reset-link -- --email parceiro@empresa.com.br [--app https://fpay-indicacao.vercel.app]
import { parseArgs } from "node:util";
import { adminClient } from "./bootstrap.mjs";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    app: { type: "string", default: "https://fpay-indicacao.vercel.app" },
  },
});

if (!values.email) {
  console.error("Informe o e-mail: npm run reset-link -- --email pessoa@empresa.com.br");
  process.exit(1);
}

const { data, error } = await adminClient().auth.admin.generateLink({
  type: "recovery",
  email: values.email.trim().toLowerCase(),
});
if (error) {
  console.error(`Não foi possível gerar o link: ${error.message}`);
  process.exit(1);
}

const link = new URL("/auth/confirm", values.app);
link.searchParams.set("token_hash", data.properties.hashed_token);
link.searchParams.set("type", "recovery");
console.log(`Link de nova senha para ${values.email} (vale por 1 hora, uma vez):`);
console.log(link.toString());
