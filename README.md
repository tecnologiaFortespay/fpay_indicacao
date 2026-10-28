# Fortes Pay · Plataforma de Indicação

Substitui a planilha de indicações e comissões: quem indicou cada cliente (CNPJ), quantas vidas
pagaram no mês (CSV do BI) e quanto pagar a cada parceiro (vidas × valor por vida vigente).

- Especificação única: [`docs/requisitos.md`](docs/requisitos.md). A seção 11 fixa os limites do MVP.
- O que ficou para depois: [`docs/depois.md`](docs/depois.md).
- Formato do CSV do BI (hipótese até chegar o arquivo real): [`docs/csv-bi.md`](docs/csv-bi.md).
- Roteiro de teste de cada fatia, para o Denis: [`docs/testes-denis.md`](docs/testes-denis.md).

## Stack

Next.js 16 (App Router), TypeScript, Tailwind 4, Supabase (Postgres + Auth + RLS), Vitest, Playwright.
Design: Sistema Órbita (copiado do projeto anterior). Código em inglês, interface em português.

## Rodar localmente

Pré-requisitos: Node 22+, Docker em execução.

```bash
npm install
npm run db:start          # sobe o Supabase local (portas 54341–54349)
npm run db:reset          # aplica as migrations do zero
cp .env.example .env.local
npm run db:status         # copie API URL, anon key e service_role key para .env.local
npm run bootstrap -- --email denis@exemplo.com --role director --name "Denis" --password "uma-senha-forte"
npm run bootstrap -- --email analista@exemplo.com --role analyst --name "Analista"
npm run dev               # http://localhost:3000
```

Perfis internos (diretor e analista de dados) são criados pelo script acima. Parceiros entram só por
convite: o diretor gera o link em **Parceiros → Convites**, a unidade preenche o cadastro, e o diretor
aprova informando a regra (valor por vida, vigência, prazo) e o meio de pagamento.

## Projeto real (Supabase da Fortes Pay)

Só `.env.local` muda: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon ou publishable
key), `NEXT_PUBLIC_APP_URL` e, para scripts, `SUPABASE_SERVICE_ROLE_KEY`. As migrations em
`supabase/migrations` são aplicadas com `npx supabase db push` (após `npx supabase link`).

Configuração de Auth no projeto real: confirmação de e-mail **desligada** (o convite já valida a
origem) e senha mínima de 8 caracteres, como em `supabase/config.toml`.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` / `format` | ESLint, `tsc`, Prettier |
| `npm test` | testes unitários (leitor de CSV, CNPJ, competência, moeda) |
| `npm run test:db` | testes das funções SQL e da RLS contra o Supabase local |
| `npm run test:e2e` | Playwright: **zera o banco local**, faz build e executa o roteiro do Denis |
| `npm run db:start` / `db:stop` / `db:status` / `db:reset` | Supabase local |
| `npm run db:types` | regenera `src/lib/supabase/types.ts` depois de uma migration |
| `npm run bootstrap` | cria diretor ou analista |

## Estrutura

```
supabase/migrations/   uma migration por fatia; toda escrita é função SQL que confere o perfil
src/app/               rotas em português (login, inicio, importacoes, parceiros, ...)
src/components/        design Órbita (shell, navegação, formulários)
src/lib/               env, sessão, leitor de CSV, consultas por domínio, rótulos
tests/db/              testes de banco (Vitest)   ·   e2e/   testes de ponta a ponta (Playwright)
```

Limite do projeto: no máximo 12 tabelas. Hoje: 9 (`profiles`, `partners`, `partner_rules`,
`companies`, `referrals`, `import_batches`, `import_rows`, `monthly_lives`, `invitations`).
