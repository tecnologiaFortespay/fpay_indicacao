# Fortes Pay · Plataforma de Indicação

Substitui a planilha de indicações e comissões: quem indicou cada cliente (CNPJ), quantas vidas
pagaram no mês (export do BI) e quanto pagar a cada parceiro (vidas × valor por vida vigente).

- Especificação única: [`docs/requisitos.md`](docs/requisitos.md). A seção 11 fixa os limites do MVP.
- O que ficou para depois: [`docs/depois.md`](docs/depois.md).
- Formato do export do BI ("Detalhamento Empresas") e o que a importação faz com ele:
  [`docs/arquivo-bi.md`](docs/arquivo-bi.md).
- Roteiro de validação, que é a definição do MVP: [`docs/roteiro-validacao.md`](docs/roteiro-validacao.md).
- Decisões tomadas depois do requisito (configuração da indicação, pagamento, ordem dos
  fechamentos): [`docs/decisoes.md`](docs/decisoes.md).

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
aprova informando a regra do parceiro (valor por vida, vigência, prazo). Cada indicação pode ter valor
por vida e prazo próprios, definidos pelo diretor em **Indicações**; em branco vale a regra do parceiro.

Para seguir o roteiro de validação à mão contra o Supabase local, mesmo com o `.env.local` apontando
para o projeto real: `npm run db:clean`, `npm run bootstrap:local` e `npm run dev:local`
(passo a passo no fim de `docs/roteiro-validacao.md`).

## Arquivos de ambiente

| Arquivo                    | Quem lê                                                 | Conteúdo                                                      |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `.env.local` (fora do git) | `npm run dev`, `build`, `start`, `bootstrap`, `db:push` | o Supabase que a aplicação usa: local ou o projeto real       |
| `.env.test` (versionado)   | `npm run test:db`, `npm run test:e2e`                   | sempre o Supabase local, com as chaves de demonstração da CLI |

Os testes apagam dados e se recusam a rodar contra qualquer URL que não seja local
(`tests/local-only.ts`).

## Projeto real (Supabase da Fortes Pay)

Projeto `mltanrtdgyrfhsqmpcum`, região `sa-east-1` (São Paulo). Em `.env.local`:
`NEXT_PUBLIC_SUPABASE_URL=https://mltanrtdgyrfhsqmpcum.supabase.co`, a anon key, a service_role
key (só para `npm run bootstrap`) e `SUPABASE_DB_URL` (pooler em modo sessão, porta 5432, só para
`npm run db:push`). Veja `.env.example`.

Passos, nesta ordem:

1. **Migrations**: `npm run db:push -- --dry-run` mostra o que falta; `npm run db:push` aplica
   `supabase/migrations` e registra o histórico em `supabase_migrations.schema_migrations`
   (não precisa de token da CLI; usa `SUPABASE_DB_URL`). Feito em 28/10/2026 com as 7 migrations.
2. **Auth**, no painel do Supabase (Authentication): "Confirm email" **desligado** (o convite já
   valida a origem; ligado, o cadastro pelo link não entra), senha mínima de 8 caracteres, Site URL
   igual ao endereço da aplicação e `<endereço>/auth/callback` nas Redirect URLs (recuperação de
   senha). Alternativa pela CLI, que lê o `[auth]` de `supabase/config.toml`:
   `npx supabase login`, `npx supabase link --project-ref mltanrtdgyrfhsqmpcum`,
   `npx supabase config diff` e `npx supabase config push`.
3. **SMTP próprio** (Authentication → SMTP Settings): o e-mail padrão do Supabase tem limite de
   poucos envios por hora, e a recuperação de senha depende dele.
4. **Contas internas**: `npm run bootstrap -- --email <diretor> --role director --name "..." --password "..."`
   e o mesmo com `--role analyst`.
5. **Variáveis no servidor do app**: nenhuma é obrigatória (veja "Deploy").

## Deploy (DigitalOcean App Platform)

- Origem: este repositório no GitHub, branch `main`. Node 22 (`engines` no `package.json`).
- Build: `npm run build`. Execução: `npm start` (o Next lê a porta em `PORT`).
- Variáveis: **nenhuma é obrigatória**. Em produção (`next build`/`next start`), o endereço e a
  anon key do projeto da Fortes Pay estão em `src/lib/env.ts` (são públicos; a RLS protege os
  dados) e completam o que o servidor não informar ou informar errado. `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, se existirem e forem válidas (chave anônima do mesmo projeto do
  endereço), têm preferência, no build ou na execução. `NEXT_PUBLIC_ENVIRONMENT_LABEL` é opcional
  (vazio em produção). Não configure `SUPABASE_SERVICE_ROLE_KEY` nem `SUPABASE_DB_URL` no app: só
  os scripts locais usam.
- O endereço público (links de convite e de recuperação de senha, cookie só https) vem da própria
  requisição: `Host`/`x-forwarded-host` e `x-forwarded-proto`, que o DigitalOcean repassa.
- Diagnóstico sem segredos em `/status`: versão publicada, endereço visto pelo servidor, de onde
  veio a conexão (execução, build ou projeto da Fortes Pay) e a resposta do Supabase à chave (200 =
  aceita). O rodapé do login mostra "Versão de" com a data do build; falhas de login que não são
  senha errada aparecem na tela com o código e vão para o log de execução.
- Depois do primeiro deploy, no Supabase: Site URL = `https://<domínio>` e
  `https://<domínio>/auth/callback` nas Redirect URLs (seção "Projeto real").

## Scripts

| Comando                                                   | O que faz                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev` / `build` / `start`                         | Next.js                                                                                          |
| `npm run dev:local`                                       | Next.js contra o Supabase local (`.env.test`), para seguir o roteiro à mão                       |
| `npm run lint` / `typecheck` / `format`                   | ESLint, `tsc`, Prettier                                                                          |
| `npm test`                                                | testes unitários (leitor do export do BI, CNPJ, competência, moeda)                              |
| `npm run test:db`                                         | testes das funções SQL e da RLS contra o Supabase local (`.env.test`)                            |
| `npm run test:e2e`                                        | Playwright: **zera o banco local**, faz build e executa o roteiro de validação e os casos extras |
| `npm run db:start` / `db:stop` / `db:status` / `db:reset` | Supabase local                                                                                   |
| `npm run db:clean`                                        | zera os dados do Supabase local (`tests/reset-data.sql`), sem recriar o schema                   |
| `npm run db:push`                                         | aplica as migrations no banco de `SUPABASE_DB_URL` (projeto real); `-- --dry-run` só lista       |
| `npm run db:types`                                        | regenera `src/lib/supabase/types.ts` depois de uma migration                                     |
| `npm run bootstrap`                                       | cria diretor ou analista no Supabase de `.env.local`                                             |
| `npm run bootstrap:local`                                 | o mesmo, no Supabase local                                                                       |

## Estrutura

```
supabase/migrations/   uma migration por fatia; toda escrita é função SQL que confere o perfil
src/app/               rotas em português (login, inicio, importacoes, parceiros, ...)
src/components/        design Órbita (shell, navegação, formulários)
src/lib/               env, sessão, leitor do export do BI (xlsx + bi), consultas por domínio, rótulos
tests/db/              testes de banco (Vitest)
e2e/roteiro.spec.ts    o roteiro de validação inteiro   ·   e2e/extras.spec.ts   casos fora do roteiro
tests/bi-export.ts     gera planilhas no formato do BI para os testes
```

Limite do projeto: no máximo 12 tabelas. Hoje: 11 (`profiles`, `partners`, `partner_rules`,
`companies`, `referrals`, `import_batches`, `import_rows`, `monthly_lives`, `invitations`,
`closings`, `closing_items`).
