# Plataforma de Indicação Fortes Pay — Documentação técnica

Versão de 04/11/2026 · Diego Nogueira

Para quem implanta, opera e mantém o sistema. As regras de negócio estão na
[documentação do produto](documentacao-do-produto.md); o passo a passo de desenvolvimento local
está no [`README.md`](../../README.md).

## 1. Visão geral

```
Navegador ──► Vercel (Next.js 16, região gru1 / São Paulo)
                 │  páginas e server actions (servidor)
                 ├──► Supabase (projeto mltanrtdgyrfhsqmpcum, sa-east-1)
                 │      Postgres com RLS em todas as tabelas · Auth (e-mail e senha)
                 └──► API da Anthropic (Claude), só para as análises do diretor
```

- O navegador nunca fala com o banco com privilégio: usa a chave pública (anon) e a sessão do
  usuário; a RLS e as funções SQL decidem o que cada perfil lê e grava.
- Toda gravação é uma **função SQL** (`security definer`) que confere o perfil antes de escrever.
  As server actions do Next só validam o formulário e chamam a função.
- O cálculo (vidas × valor vigente, prazo, saldo) é feito em SQL, em duas views.
- A IA só lê números que o sistema já calculou e devolve texto; não grava fora da própria tabela.

## 2. Onde está cada coisa

| Item          | Onde                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| Código        | GitHub `tecnologiaFortespay/fpay_indicacao`, branch `main`                              |
| Aplicação     | Vercel, projeto da Fortes Pay; https://fpay-indicacao.vercel.app (domínio a configurar) |
| Banco e login | Supabase, projeto `mltanrtdgyrfhsqmpcum`, região `sa-east-1`                            |
| IA            | API da Anthropic; chave em `ANTHROPIC_API_KEY` nas variáveis da Vercel                  |
| Diagnóstico   | https://fpay-indicacao.vercel.app/status (sem segredos)                                 |

## 3. Stack

| Camada        | Tecnologia                                                               |
| ------------- | ------------------------------------------------------------------------ |
| Aplicação     | Next.js 16.4 (App Router, server actions), React 19.3, TypeScript        |
| Interface     | Tailwind 4, componentes próprios (Sistema Órbita), fonte Geist           |
| Banco e login | Supabase: Postgres, Auth, RLS; `@supabase/ssr` e `@supabase/supabase-js` |
| Validação     | Zod 4                                                                    |
| Planilha      | leitores próprios de .xlsx (sobre `fflate`) e .csv, sem biblioteca       |
| IA            | `@anthropic-ai/sdk`, modelo `claude-opus-5-5`                            |
| Testes        | Vitest (unidade e banco), Playwright (ponta a ponta)                     |
| Runtime       | Node 22 ou mais novo                                                     |

## 4. Estrutura do repositório

```
supabase/migrations/   14 migrations, em ordem; toda escrita é função SQL que confere o perfil
supabase/config.toml   configuração do Supabase LOCAL (não aplicar no projeto real)
src/app/               rotas em português: login, inicio, parceiros, indicacoes, importacoes,
                       fechamento, fechamentos, equipe, minha-conta, meu-cadastro, convite,
                       nova-senha, status, ...
src/components/        shell, navegação, formulários e o kit de tela (PageIntro, SectionCard,
                       Notice, FormDisclosure, Stepper, ...)
src/lib/               env, sessão, leitor do BI (imports/xlsx.ts, csv.ts, bi.ts), consultas
                       por domínio, IA (ai/), rótulos e glossário
src/proxy.ts           renova a sessão a cada requisição e impede cache de páginas logadas
tests/db/              testes das funções SQL e da RLS (Vitest, Supabase local)
e2e/                   roteiro de validação inteiro + casos extras (Playwright)
scripts/               bootstrap (primeiro diretor), reset-link, db-push, db-clean, local
docs/                  requisitos, decisões, formato do BI, roteiro, o que ficou para depois
```

Convenções: código e nomes em inglês, interface em português; uma instrução por linha; sem
abstração para o futuro. Limite do projeto: **no máximo 12 tabelas** (hoje são 12); tabela nova
só com aprovação.

## 5. Banco de dados

### Tabelas

| Tabela           | Guarda                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `profiles`       | um por usuário do Auth: perfil (`director` ou `partner`), parceiro, nome; hash do link de nova senha                                 |
| `partners`       | parceiros: tipo (unidade/externo), contato, situação (pendente, ativo, recusado), motivo da recusa, aprovação                        |
| `partner_rules`  | vigências da regra: valor por vida, vale a partir de (mês), prazo em meses                                                           |
| `invitations`    | convites: hash do token, nome, tipo, validade, uso                                                                                   |
| `companies`      | empresas indicadas (CNPJ, nome, grupo, primeiro mês visto)                                                                           |
| `referrals`      | indicações: parceiro, CNPJ, situação, primeiro mês pago, vidas estimadas, valor e prazo próprios                                     |
| `import_batches` | cada envio da planilha: arquivo, hash, meses, contagens (lidas, importadas, fora, ignoradas), quem enviou                            |
| `import_rows`    | linhas ignoradas ou mescladas de cada envio, com o motivo                                                                            |
| `monthly_lives`  | vidas pagas por CNPJ e mês (substituídas a cada envio do mês)                                                                        |
| `closings`       | fechamento por mês: em preparação ou fechado, quem preparou e quem fechou                                                            |
| `closing_items`  | linha do fechamento por parceiro: vidas, valor, ajuste e motivo, saldo anterior, total, decisão, resposta do parceiro, como foi pago |
| `ai_reviews`     | análises da IA (de um envio ou de um fechamento): situação, resumo, alertas, erro                                                    |

### Views de cálculo

- `referral_month_lives`: por indicação e mês dentro do prazo, as vidas, o valor por vida aplicado
  (próprio da indicação ou regra vigente do parceiro no mês) e o valor.
- `partner_month_amounts`: soma por parceiro e mês. Painéis e preparo do fechamento leem daqui.

### Funções SQL principais

| Assunto    | Funções                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Perfil     | `is_director`, `my_partner_id`, `current_profile`, `current_role_name`                                                      |
| Convite    | `create_invitation`, `invitation_preview`, `register_partner`, `register_director`, `confirm_invited_signup`                |
| Equipe     | `list_directors`                                                                                                            |
| Parceiro   | `approve_partner`, `reject_partner`, `save_partner`, `save_partner_rule`, `delete_partner_rule`                             |
| Indicação  | `create_referral`, `set_referral_status`, `set_referral_config`, `valid_cnpj`                                               |
| Importação | `import_lives`, `preview_import` (conferência: roda e desfaz), `last_import_at`, `latest_complete_competency`               |
| Fechamento | `closing_blocker`, `prepare_closing`, `set_closing_adjustment`, `close_closing`, `respond_closing_item`, `set_payment_note` |
| Senha      | `create_password_reset`, `password_reset_preview`, `reset_password_with_token`, `change_my_password`                        |
| IA         | `start_ai_review`, `finish_ai_review`                                                                                       |

Regras garantidas no banco (não só na tela):

- **RLS ligada nas 12 tabelas.** Parceiro lê só o que é dele; diretor lê tudo.
- **Mês fechado é imutável.** O trigger `protect_partner_rules` impede criar, editar ou apagar
  vigência usada por mês fechado; `import_lives` ignora linhas de mês fechado.
- **Fechamentos em ordem** (`closing_blocker`): o mês precisa ter terminado (fuso de Fortaleza),
  ter um envio feito depois do fim do mês e não ter mês anterior aberto com envio.
- **Envio parcial × mês completo** (`latest_complete_competency`): só um envio do mês já terminado
  marca inadimplência.
- **CNPJ único** em `referrals`; o erro ao parceiro não revela quem indicou.

### Mudar o banco

1. Crie uma migration nova em `supabase/migrations/` (`AAAAMMDDHHMMSS_nome.sql`); nunca edite
   uma já aplicada.
2. Teste no Supabase local: `npm run db:reset`, `npm run test:db`, `npm run test:e2e`.
3. Regere os tipos: `npm run db:types`.
4. Aplique no projeto real: `npm run db:push -- --dry-run` (lista) e `npm run db:push` (aplica e
   registra em `supabase_migrations.schema_migrations`). Usa `SUPABASE_DB_URL` do `.env.local`.

## 6. Login e perfis

- Supabase Auth com e-mail e senha. O cookie de sessão é `fp-indicacao-auth` (httpOnly, `secure`
  em https). `src/proxy.ts` renova a sessão a cada requisição.
- São dois perfis: **diretor** e **parceiro**. Quem envia a planilha do BI usa o perfil de diretor.
- **Diretores**: o primeiro é criado por script (`npm run bootstrap`); os demais entram por convite
  em **Equipe** (tipo `director` em `invitations`, função `register_director`) e entram direto, sem
  aprovação. Todos os diretores são iguais.
- **Parceiro** só entra por convite: o token vai no link e só o hash SHA-256 fica no banco. O
  cadastro cria o usuário no Auth e o perfil; até a aprovação, o login só mostra "Cadastro em
  análise".
- "Confirm email" está **desligado** no Supabase (o convite é que valida a origem).
- **Nova senha**: um diretor gera um link de 24 horas e uso único (hash em `profiles`,
  `create_password_reset`): para parceiro, na ficha dele; para outro diretor, em Equipe. Quem está
  conectado troca a própria senha em **Minha conta** (`change_my_password`, que confere a senha
  atual com bcrypt e grava a nova no formato do Supabase Auth). Último recurso para um diretor:
  `npm run reset-link -- --email <e-mail>` gera um link de recuperação do Supabase (1 hora), sem
  enviar e-mail.
- Toda server action confere o perfil (`actionUser`); sem sessão, devolve "Sua sessão expirou" e
  manda para o login.

## 7. Fluxos no código

| Fluxo               | Arquivos principais                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Envio da planilha   | `src/app/importacoes/import-form.tsx` → `actions.ts` (`previewImport` → RPC `preview_import`; `uploadImport` → RPC `import_lives`) → `src/lib/imports/file.ts` (arquivo) → `xlsx.ts` ou `csv.ts` (leitura) → `bi.ts` (colunas, mês, CNPJ) |
| Painéis             | `src/lib/dashboard/queries.ts` (diretor), `src/lib/partner-panel/queries.ts` (parceiro)                                                                                                                                                   |
| Fechamento          | `src/app/fechamento/` + `src/lib/closings/queries.ts` → RPCs de fechamento                                                                                                                                                                |
| Indicações e etapas | `src/app/indicacoes/`, `src/lib/referrals/` (`stages.ts`: etapas e frases; `transitions.ts`: mudanças permitidas, espelho da função SQL)                                                                                                  |
| Convite e aprovação | `src/app/convite/`, `src/app/parceiros/`, `src/lib/invitations/queries.ts`                                                                                                                                                                |
| IA                  | `src/lib/ai/material.ts` (o que vai para a IA), `claude.ts` (chamada), `reviews.ts` (registro)                                                                                                                                            |
| Mensagens e erros   | `src/lib/actions.ts` (`databaseError`: códigos do banco → texto), `src/lib/auth/errors.ts`, `src/lib/flash.ts`                                                                                                                            |

O formato da planilha do BI e as regras de leitura estão em [`docs/arquivo-bi.md`](../arquivo-bi.md).
Se o BI mudar as colunas, só `src/lib/imports/bi.ts` e os testes dele mudam.

## 8. IA

- Chamada só pelo servidor, com `ANTHROPIC_API_KEY`. Modelo `claude-opus-5-5`, esforço médio,
  saída em JSON validada por schema, até 16 mil tokens, timeout de 180 s e uma nova tentativa. Se o
  modelo recusar por política, a API refaz a chamada num modelo de reserva (beta
  `server-side-fallback-2026-07-01`).
- A análise roda **depois da resposta** (`after()` do Next): o usuário não espera. As páginas de
  Importações e Fechamento têm `maxDuration = 300`. A tela se atualiza a cada 4 s enquanto a
  análise roda; depois de 5 minutos sem resposta, a análise é dada como travada e o botão volta.
- Sem a chave, as telas dizem que a IA não está ligada e o resto funciona igual. `/status` mostra
  `"ia": "ligada"` quando a chave existe.
- Dados enviados: nomes de parceiros e empresas, CNPJs, situação, vidas e valores; nunca e-mail,
  telefone ou dados de pagamento.

## 9. Variáveis de ambiente

### Na Vercel (aplicação)

| Variável                        | Obrigatória | Para quê                                                      |
| ------------------------------- | ----------- | ------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`             | não         | liga a IA; marcar como Sensitive                              |
| `NEXT_PUBLIC_SUPABASE_URL`      | não         | endereço do Supabase; sem ela vale o do projeto da Fortes Pay |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | não         | chave pública; precisa ser do mesmo projeto do endereço       |
| `NEXT_PUBLIC_ENVIRONMENT_LABEL` | não         | etiqueta de ambiente na tela (vazia em produção)              |

Em produção, o endereço e a chave **pública** do projeto da Fortes Pay estão em `src/lib/env.ts`
(são públicos por natureza; quem protege os dados é a RLS). O endereço do próprio site vem da
requisição (`x-forwarded-host`), então links de convite e de nova senha seguem o domínio em uso.

**Nunca** configure na Vercel `SUPABASE_SERVICE_ROLE_KEY` nem `SUPABASE_DB_URL`: elas dão acesso
total ao banco e só os scripts locais usam.

### Na máquina de quem administra (`.env.local`, fora do git)

| Variável                        | Para quê                                                               |
| ------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | projeto real                                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave pública                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`     | `npm run bootstrap` e `npm run reset-link` (Supabase → Settings → API) |
| `SUPABASE_DB_URL`               | `npm run db:push` (pooler em modo sessão, porta 5432)                  |
| `ANTHROPIC_API_KEY`             | IA no ambiente local (opcional)                                        |

O modelo está em `.env.example`, só com marcadores. `.env.test` (versionado) aponta sempre para o
Supabase local, com as chaves de demonstração da CLI.

## 10. Publicação

- **Aplicação**: todo push em `main` no GitHub publica sozinho na Vercel (build `next build`,
  funções em `gru1`, definido em `vercel.json`). Confira a versão em `/status` (`versao` = data do
  build).
- **Banco**: migration nova vai por `npm run db:push` (seção 5), **antes** do push do código que
  depende dela.
- **Configuração do login no Supabase** (Site URL, Redirect URLs, Confirm email): pela CLI, com um
  `config.toml` só com esses campos numa pasta à parte, aplicado com
  `npx supabase --workdir <pasta> config push --project-ref mltanrtdgyrfhsqmpcum` (detalhes no
  README, seção "Projeto real"). Não use o `supabase/config.toml` do repositório.
- **Deploys de preview** (branches e pull requests) também apontam para o banco real. Não teste
  nada destrutivo num preview.

## 11. Operação

### Conferir a saúde

`/status` responde JSON com: versão publicada, endereço visto pelo servidor, origem da conexão com
o Supabase, a resposta do Supabase à chave (200 = aceita), problemas de configuração e se a IA está
ligada.

### Criar o primeiro diretor

```bash
npm run bootstrap -- --email nome@fortespay.com.br --role director --name "Nome" --password "<senha>"
```

Só para o primeiro diretor de um ambiente novo: os demais (também quem envia a planilha do BI) são
convidados pela tela **Equipe**. Se o e-mail já existir, o script atualiza o perfil e a senha.

### Nova senha de diretor (último recurso)

O caminho normal é outro diretor gerar o link em **Equipe**. Sem outro diretor disponível:

```bash
npm run reset-link -- --email <e-mail>
```

Mostra um link de 1 hora e uso único; não envia e-mail. Para parceiros, use a ficha do parceiro.

### Configurar o domínio da Fortes Pay

1. Vercel → projeto → Settings → Domains → adicionar o domínio (por exemplo
   `indicacao.fortespay.com.br`) e criar no DNS o registro que a Vercel indicar.
2. Supabase → Authentication → URL Configuration: **Site URL** = `https://<domínio>`; em
   **Redirect URLs**, acrescentar `https://<domínio>/auth/callback` e `https://<domínio>/**`
   (pode manter os endereços da Vercel enquanto houver links antigos circulando).
3. Nada muda no código. Abrir `https://<domínio>/status` e conferir `endereco`.

### Limpar os dados de teste antes do uso real

Apaga parceiros, convites, indicações, envios, vidas, fechamentos e análises da IA, e os logins de
parceiro. Mantém os diretores. **Irreversível**: rode com o `SUPABASE_DB_URL`, de
preferência depois de um backup (Supabase → Database → Backups).

```sql
begin;
create temp table contas_de_parceiro on commit drop as
  select user_id from public.profiles where role = 'partner';
delete from public.closings;        -- leva junto closing_items e as análises de fechamento
delete from public.ai_reviews;
delete from public.monthly_lives;
delete from public.import_batches;  -- leva junto import_rows
delete from public.referrals;
delete from public.companies;
delete from public.invitations;
delete from public.profiles where role = 'partner';
delete from public.partners;        -- leva junto partner_rules
delete from auth.users where id in (select user_id from contas_de_parceiro);
commit;
```

A ordem importa: os fechamentos saem primeiro para liberar as vigências travadas por mês fechado.
Testado no Supabase local em 04/11/2026.

### E-mail

O sistema não envia e-mail e nenhum fluxo depende dele: convites e links de nova senha são copiados
pelo diretor e enviados por conta própria, e o "Esqueci minha senha" da tela só explica esse caminho.
Não é preciso configurar SMTP.

## 12. Testes

| Comando                             | O que cobre                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                          | 44 testes de unidade: leitor do BI, CNPJ, mês, moeda, etapas, chamada da IA                                                              |
| `npm run test:db`                   | 40 testes das funções SQL e da RLS, contra o Supabase local                                                                              |
| `npm run test:e2e`                  | Playwright: zera o banco local, faz o build e executa o roteiro de validação inteiro e 9 casos extras (IA com uma imitação local da API) |
| `npm run lint`, `npm run typecheck` | ESLint e TypeScript                                                                                                                      |

Os testes de banco e de ponta a ponta se recusam a rodar contra um Supabase que não seja local
(`tests/local-only.ts`). Em 04/11/2026, além da suíte, um smoke contra o sistema publicado percorreu
os quatro perfis com a IA real e apagou os próprios dados no fim.

Para rodar tudo localmente (Docker em execução): `npm run db:start`, `npm run db:reset`, depois os
comandos acima. Passo a passo no README.

## 13. Segurança

- Chaves com acesso total (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`) só na máquina de quem
  administra; nunca na Vercel, no código ou no git.
- O repositório está **público** no GitHub da Fortes Pay. Não há segredo nele (a chave pública do
  Supabase é pública por natureza), mas a recomendação é torná-lo privado antes do uso real.
- Planilhas reais do BI nunca vão para o git (`*.xlsx` no `.gitignore`; os CSV reais ficam em `.local/`).
- Tokens de convite e de nova senha: só o hash fica no banco. Senhas ficam no Supabase Auth.
- Páginas logadas saem com `Cache-Control: no-store`.

## 14. Limites e pontos de atenção

- Vercel aceita requisições de até 4,5 MB: o envio da planilha aceita até 4 MB (o export real tem
  cerca de 150 KB) e 50.000 linhas.
- Funções da Vercel: até 300 s nas páginas com IA (`maxDuration`).
- Um login por parceiro; perfil de vendedor ainda não existe (fase 2, prevê duas tabelas novas).
- Hipóteses a confirmar com a Fortes Pay: "C. Cash-in" é a coluna de vidas pagas; o export parcial
  traz o acumulado do mês (`docs/arquivo-bi.md`, `docs/decisoes.md`).
- O que ficou para depois está em `docs/depois.md`.

## 15. Documentos do repositório

| Arquivo                     | Conteúdo                                                     |
| --------------------------- | ------------------------------------------------------------ |
| `README.md`                 | rodar localmente, projeto real, deploy, scripts, kit de tela |
| `docs/requisitos.md`        | levantamento original (27/10/2026); não é alterado           |
| `docs/decisoes.md`          | decisões posteriores, com data; valem sobre o levantamento   |
| `docs/arquivo-bi.md`        | formato da planilha do BI e regras da importação             |
| `docs/roteiro-validacao.md` | roteiro de testes (definição do MVP), executado pelo e2e     |
| `docs/depois.md`            | ideias anotadas e não implementadas                          |
| `docs/entrega/`             | esta documentação e a do produto                             |
