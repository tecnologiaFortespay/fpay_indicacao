# Requisitos — Plataforma de Indicação (Fortes Pay)

Versão 27/10/2026 · Diego Nogueira

Levantamento extraído da reunião gravada em 15/10/2026 (53 min) com o diretor Denis, mais as decisões tomadas em 27/10. Cada item traz o minuto da gravação para conferência. **[CONFIRMAR]** marca o que a transcrição deixou ambíguo; nada foi inventado para preencher lacuna.

Este documento é a única especificação do projeto `fpay_indicacao`. O Plano R1 e as Histórias v3 do projeto anterior não valem mais.

## 1. Objetivo e dor atual

A plataforma substitui a planilha de controle de indicações e comissões da Fortes Pay: quem indicou cada cliente, quantas vidas pagaram no mês e quanto pagar a cada parceiro. Hoje o processo é manual e sujeito a erro [05:19–06:50].

| Etapa de hoje (manual) | Como é feito | Trecho |
| --- | --- | --- |
| Levantar clientes que pagaram no mês | Consulta no BI da Fortes Pay, filtro por mês, exportação para planilha | [05:43], [37:01] |
| Identificar quem indicou | Lookup na planilha (unidade e colaborador que indicou) | [05:59] |
| Calcular comissão | Fórmula na planilha: vidas pagas × valor por vida | [05:59–06:22] |
| Pagar | Parceiro emite nota do valor calculado; Fortes Pay paga | [06:22] |
| Receber indicações | Formulário/planilha desorganizado; "às vezes a pessoa não tem acesso" | [06:22–07:00] |

O projeto é visto como piloto do que depois se estende às outras áreas ("fazer algo similar para todo mundo") [04:26]. O trabalho do diretor deve se reduzir a "entrar, acompanhar e fechar o mês" [27:37].

## 2. Perfis de acesso

Cada usuário loga e vê só o que é dele; o diretor vê tudo [12:50], [15:11].

| Perfil | Quem é | O que vê / faz | Trecho |
| --- | --- | --- | --- |
| Diretor | Gestão da Fortes Pay (Denis) | Visão geral de todos; aprova cadastros; cria e edita regras; confere base e cálculo; fecha o mês | [12:50], [15:11], [16:05] |
| Parceiro (unidade) | Dono da unidade franqueada | Suas indicações, status, vidas pagas no mês, quanto tem a receber | [15:11], [18:13] |
| Parceiro externo | Indicador que não é unidade (ex.: contato em Natal que conhece empresários) | Mesmo conceito e mesma tela do parceiro de unidade | [20:59] |
| Analista de dados | Pessoa da Fortes Pay que sobe o CSV do BI | Só importa e vê o log de importações; não vê regras nem fechamento | decisão 27/10 |
| Vendedor (fase 2) | Vendedor de uma unidade | Só indica e acompanha suas indicações; **não vê faturamento** da unidade | [18:36], [19:29] |
| Contador | Contador que indica clientes | É um parceiro com regra que tem prazo (seção 5); não é perfil separado | [23:59] |

- **Só o diretor** cria e edita regras de remuneração, aprova cadastros e fecha o mês. O parceiro vê apenas os próprios dados; nunca vê outros indicadores nem suas indicações (decisão 27/10).
- O diretor não quer que vendedores vejam o faturamento da unidade; por isso o perfil Vendedor é só de indicação [19:29].
- Uma mesma pessoa pode ter dois perfis (dono da unidade que também indica como vendedor) [18:36] **[CONFIRMAR]** se são dois logins ou um login com duas áreas.

## 3. Cadastro de parceiros e vendedores

- Fluxo de cadastro (decisão 27/10): o diretor gera um **link de convite por unidade** (com validade); a unidade abre o link, preenche seus dados e fica **pendente**; o diretor **aprova** e só então o acesso é liberado. Não há link público de cadastro. São cerca de 30 parceiros hoje, volume cresce aos poucos [14:44–15:11].
- A aprovação **exige preencher a regra** (valor por vida, vigência, prazo) e o meio de pagamento na mesma tela. Não existe parceiro ativo sem regra (decisão 27/10).
- Após aprovado, o parceiro passa a aparecer na lista com seus dados (de onde é, unidade) e só enxerga os próprios dados ao logar [15:11].
- Cada parceiro tem a **sua** regra de remuneração e o **seu meio de pagamento** cadastrados (seção 5) [16:23].
- Indicador externo (fora de unidade) entra pelo mesmo cadastro de parceiro, com seu próprio link de convite [20:59].
- Vendedores (fase 2) são cadastrados **dentro da unidade** (lista de vendedores por parceiro); o cadastro do vendedor carrega a regra dele e o meio de pagamento [25:48], [26:18].
- Vendedor na indicação (fase 2, decisão 27/10): a indicação tem o campo **Vendedor**, opcional, escolhido na lista da unidade. Se ficar vazio, a indicação é do próprio dono e não gera comissão de vendedor. Motivo: o dono pode ser o vendedor [26:47], e a atribuição precisa ser por indicação, não por unidade, para o relatório por vendedor [23:04].

## 4. Indicações

- Parceiro registra a indicação de um cliente (empresa, por CNPJ) na plataforma [07:35], [15:41].
- Diretor também pode registrar indicação, embora na prática não faça [15:41].
- A indicação pode trazer número de **vidas estimadas** antes do fechamento [13:11].
- A indicação vira cliente pagante quando o cliente paga a primeira fatura na Fortes Pay; a partir daí as vidas pagas entram no cálculo mensal [05:43–06:22].
- Diretor vê as indicações feitas por cada parceiro [15:41].

**Status da indicação** (decisão 27/10 — só "em negociação" foi citado na reunião [13:11]):

| Status | Quando entra | Quem muda | Conta vidas? |
| --- | --- | --- | --- |
| Indicada | Parceiro registrou | Automático | Não |
| Em negociação | Comercial da Fortes Pay fez contato | Diretor | Não (só estimadas) |
| Fechada | Contrato assinado, ainda sem fatura paga | Diretor | Não |
| Ativa | Primeira fatura paga; cliente apareceu no CSV do BI | Automático na importação (CNPJ) | **Sim** |
| Inadimplente | Cliente ativo sem pagamento no mês | Automático na importação | Não naquele mês |
| Perdida | Negociação não fechou | Diretor | Não |
| Cancelada | Cliente ativo rescindiu | Diretor | Não; encerra a recorrência |

Indicação duplicada (mesmo CNPJ indicado por dois parceiros): **vale a primeira**. O sistema critica na hora do segundo registro e **não cadastra** (decisão 27/10). Ao parceiro que tentou, mostrar só "CNPJ já indicado em dd/mm", sem o nome de quem indicou — parceiro não vê dados de outros (seção 2); o nome aparece apenas para o diretor.

## 5. Regras de remuneração

A regra é por parceiro, não global, e **não existe valor padrão no sistema**: valor por vida, vigência e prazo são campos configuráveis no cadastro de cada parceiro, editados só pelo diretor (decisão 27/10). A maior complexidade da plataforma está aqui e na importação de dados [17:21].

| Quem recebe | Como calcula | Recorrência | Prazo | Trecho |
| --- | --- | --- | --- | --- |
| Parceiro (unidade ou externo) | Valor por vida configurado no parceiro × vidas pagas no mês. Exemplos citados: R$ 1,50 (comum) e R$ 2,00 (parceiro estratégico) | Todo mês enquanto o cliente pagar | Configurável; em branco = sem prazo | [08:31], [16:23], [20:59] |
| Contador | Mesma regra do parceiro | Todo mês | Configurável; exemplo citado: 12 meses, negociável (18) | [23:59–25:02] |
| Vendedor (fase 2) | Valor por vida (ex.: R$ 1,50 × 48 vidas = R$ 72) **ou** valor fixo (ex.: R$ 20) que não multiplica por vidas | **Uma vez só**, no fechamento do cliente | — | [22:37–23:04], [25:48–26:18] |

- Campos da regra no cadastro do parceiro, todos configuráveis por parceiro: **valor por vida**, **vigência** (a partir de quando vale) e **prazo em meses** (em branco = sem prazo). Com isso a regra do contador é só um parceiro com prazo ("mata por dois") [24:26–25:02].
- A vigência muda de parceiro para parceiro; quando a regra de um parceiro muda, os dois valores ficam registrados e cada período multiplica pelo valor vigente nele [16:55].
- **Meio de pagamento** é um campo do cadastro do parceiro (e do vendedor, fase 2), com opções: **cartão** (crédito na plataforma Fortes Pay), **PIX** e **depósito/transferência bancária**, com os dados correspondentes (chave PIX ou banco/agência/conta). O fechamento mostra o meio de cada um para quem paga (decisão 27/10; [21:51–22:14]).
- Vendedor passou a ser pago **direto pela Fortes Pay** (antes pagava a unidade, que deveria repassar e não repassava) [21:28–21:51].
- Hoje o controle do vendedor é feito na mão e não há relatório; o diretor confia na boa-fé [21:51], [22:37].

## 6. Fechamento mensal

Competência mensal: em outubro fecha-se setembro [08:54].

1. Base do mês já está alimentada ao longo do mês (importação, seção 7); não há digitação no fechamento [08:31].
2. Diretor **confere a base** e **revisa o cálculo** antes de fechar [16:05].
3. Diretor **marca quem vai ser pago** e aperta **Fechar lote**: depois disso não entra mais nada naquela competência [10:04].
4. Cada parceiro **confirma ou não** o valor do seu fechamento [10:04].
5. Parceiro emite a nota fiscal do valor; Fortes Pay paga [06:22].

Regras:

- **Acumular saldo** é uma decisão tomada na hora do fechamento, parceiro a parceiro, depois de conversa com ele ("junta aí, mês que vem você faz o fechamento"). Não há valor mínimo automático nem limite de meses acumulando (ex.: parceiro de R$ 100/mês que prefere juntar R$ 500) (decisão 27/10; [09:26–10:04]).
- Mecânica: quem não for marcado no fechamento fica **pendente**, aparece no próximo fechamento com o saldo anterior somado ao do mês, e assim sucessivamente até ser marcado. O saldo pendente fica visível no painel do parceiro e do diretor (decisão 27/10).
- Cada fechamento registra, por parceiro: valor do mês, saldo anterior, total, se foi pago ou acumulado, data e quem decidiu — é o histórico que resolve a discussão "você não me pagou tal mês".
- Fechamento pode ter ajuste manual antes do lote ser fechado [08:54].
- Fechamento da competência só é liberado se houver uma importação daquela competência feita após o fim do mês (evita fechar setembro com CSV do dia 20).
- Unidades citadas no fechamento: Teresina, Natal, Manaus, Aracaju, São Paulo, Belém e outras [09:26].
- Valores citados como exemplo: parceiro com 264 vidas pagas em outubro contra 272 previstas; mês anterior 172 vidas × R$ 1,50 [08:05–08:31].

## 7. Importação de dados

A fonte é a **tabela de desempenho do BI da Fortes Pay** (clientes pagantes e vidas por mês); a plataforma só lê, nunca escreve no BI [37:01], [42:36].

| Dado | Origem | Como entra na plataforma | Trecho |
| --- | --- | --- | --- |
| Clientes pagantes, vidas, mês | BI da Fortes Pay (filtro por mês; grupo, empresa, CNPJ) | **Manual, 2 a 3 vezes por semana**: o analista de dados baixa o CSV do BI e sobe na plataforma; o sistema atualiza os painéis. Motivo: os parceiros querem acompanhar ao longo do mês se está fechando (decisão 27/10; [27:37], [28:03]) | [37:01–37:45] |
| Dados cadastrais da empresa (município, UF) | Não estão no BI; vêm de outra base ("base LG"?) **[CONFIRMAR fonte]** | Fora desta fase (sem penetração por região, não é necessário) | [40:15] |
| Histórico de empresas que entraram/saíram | Planilha de dados da Géssica (origem de todas as outras planilhas) | Carga inicial | [36:34], [45:20] |

Regras:

- O sistema aceita o CSV **no formato em que sai do BI**. Formato real ainda não recebido: **[CONFIRMAR]** colunas (hipótese: grupo, empresa, CNPJ, vidas, mês). Não exigir cabeçalho próprio — foi o erro do projeto anterior.
- Cada subida de CSV **substitui os dados do mês** que ele cobre (chave CNPJ + competência), nunca soma: subir o mesmo arquivo duas vezes não duplica vidas. Importação trata **CNPJ e nome repetidos** [38:11].
- A tela de importação mostra data/hora da última subida e quem subiu; o painel do parceiro exibe "dados atualizados em …".
- O **login do BI expira a cada 4–5 dias**; automação via link do relatório quebraria a cada troca de login. Decisão: não automatizar agora; levar a necessidade ao time da Somapay/Soma e pedir acesso **somente leitura** seguro [10:33], [38:36–39:31], [42:36].
- Nenhum dado é alterado na origem: "só leitura, não tem writing" [42:36].

## 8. Visões e relatórios

| Visão | Para quem | Conteúdo pedido | Trecho |
| --- | --- | --- | --- |
| Painel do parceiro | Parceiro | Vidas pagas no mês até hoje (ex.: dia 5, dia 10), quanto vai receber, saldo pendente, histórico, "dados atualizados em"; permite ao parceiro cobrar o cliente inadimplente e reduzir churn | [28:03–29:12] |
| Painel do diretor | Diretor | Visão geral de todos os parceiros: vidas do mês, valor a pagar, saldo pendente, indicações por status | [13:30], [15:11] |
| Fechamento | Diretor | Valor por parceiro na competência, saldo acumulado, pago/acumulado, confirmação do parceiro | [09:26–10:04] |
| Relatório por vendedor (fase 2) | Diretor | Quais clientes cada vendedor indicou e quanto recebeu | [23:04] |

Fora desta fase (decisão 27/10): penetração por região [40:15–41:30]; visão por consultor [46:03]; assistente de IA para consultar dados [17:21], [48:07]; faturamento e cartão no painel do diretor [13:30].

## 9. Decisões e pontos a confirmar

**Decidido**

- Prioridade: **parceiro primeiro**; vendedor na sequência ("é um negócio mais chato") [25:02–25:31].
- Importação manual nesta fase (CSV do BI, 2–3×/semana, analista de dados); automação fica para depois, via time da Soma, somente leitura [39:31], [42:36].
- Penetração por região não entra nesta fase (27/10).
- Sem valor padrão de comissão; regra, vigência, prazo e meio de pagamento configuráveis por parceiro, editados só pelo diretor (27/10).
- Cadastro feito pela própria unidade via link de convite por unidade, com aprovação do diretor; aprovar exige preencher regra e meio de pagamento (27/10).
- CNPJ duplicado: vale a primeira indicação; o segundo registro é barrado na hora (27/10).
- Saldo acumulado sem limite; quem não é marcado no fechamento segue pendente e somando (27/10).
- Diego desenvolve; Fortes Pay é dona do projeto: código no GitHub da Fortes Pay, banco Supabase, variáveis de ambiente e documentação entregues a eles [13:59].
- Acesso ao banco só por chaves [48:07].

**A confirmar com o cliente**

- [ ] Formato real do CSV exportado do BI (pedir um arquivo de exemplo)
- [ ] Dono de unidade que também vende: dois logins ou um login com duas áreas [18:36]
- [ ] Fonte dos dados cadastrais (município/UF) — só se algum relatório futuro precisar [40:15]

**Fora de escopo desta ata:** explicação do produto cheque especial/rescisão [29:40–33:25] e configuração de licenças Claude [49:26–53:00].

## 10. Por que o projeto anterior foi abandonado (27/10)

A pasta `FPAY Novo` (repositório `fortespay-indica`) contém a "R1 ampliada v3": 36 histórias, 57 migrations (67 tabelas, 207 funções SQL), ledger financeiro, documentos privados, migração de legado XLSX, mensagens internas, automações, assistente de IA, relatórios executivos, auditoria e fila operacional. Publicado em homologação, 303 cenários Supabase passando, aceite humano pendente em tudo, zero uso real, zero dado.

Motivos da decisão de recomeçar:

- O motor de remuneração foi construído antes das regras reais (decisões D-01 a D-12 em aberto) e é muito mais complexo que o pedido: a regra do parceiro tinha produto, modalidade, gatilho, elegibilidade, duração, contagem, vigência, alcance, versões e beneficiários; o Denis quer três campos.
- A importação exigia cabeçalho próprio (`external_id;cnpj;empresa;produto;vidas;recarga;evento_id;evento_em;elegivel`), não o arquivo do BI.
- Código comprimido (610 KB de TypeScript em 4.339 linhas), ilegível para manutenção humana.
- Apagar tabelas não reduz o sistema: as funções de fechamento referenciam quase todas elas.

O repositório fica preservado como referência. Banco: Denis apaga o Supabase atual e cria outro (28/10); até lá, desenvolvimento local.

## 11. Projeto novo — limites e reaproveitamento

**Design:** o mesmo Sistema Órbita do projeto anterior. Copiar de `~/Developer/FPAY Novo`, lendo antes: `src/app/globals.css` (tokens e componentes), `src/app/orbita-tokens.css`, `src/components/ui/*` (button, card, input, label), `src/components/app-shell.tsx`, `orbita-navigation.tsx`, `orbita-icon.tsx`, `auth-shell.tsx`, `auth-form.tsx`, `fields.tsx`, `session-controls.tsx`, `public/brand/fp-simbolo.png`. Não copiar: assistente, mascote, relatórios, gráficos, editor de acordos.

**Lógica que vale copiar com leitura:** `src/lib/supabase/server.ts`, `src/lib/auth/access.ts`, `permissions.ts`, `policy.ts`, `validation.ts` (padrões de sessão e autorização), `src/lib/imports/file.ts` (validação de arquivo CSV, trocando o cabeçalho fixo pelo do BI), fluxo de convite/aprovação (`src/app/convite`, `criar-conta`, `solicitacoes`). Reescrever em código legível; não colar as linhas comprimidas.

**Limites do MVP (regras "nunca"):**

1. Nunca mais de **12 tabelas** sem aprovação explícita do Diego. Proposta de partida: `partners`, `partner_users`, `invitations`, `partner_rules` (uma linha por vigência), `companies`, `referrals`, `import_batches`, `import_rows`, `monthly_lives`, `closings`, `closing_items`, `payments`. Vendedor entra depois com `sellers` e `seller_commissions`.
2. Nunca abstração para o futuro: sem motor de regras, sem modalidades, sem produto, sem beneficiário, sem ledger de movimentos. Cálculo é `vidas × valor vigente`, em SQL.
3. Nunca código comprimido: uma instrução por linha, funções curtas, nomes em inglês, interface em português.
4. Nunca funcionalidade fora deste documento. Se parecer útil, anotar em `docs/depois.md` e seguir.
5. Nunca parar para discutir visual: o design é o Órbita copiado.
6. Nunca IA no cálculo ou na elegibilidade.

**Ordem de entrega (cada fatia testável pelo Denis de ponta a ponta):**

1. Importar o CSV do BI e ver vidas do mês por parceiro com o valor calculado.
2. Cadastro de parceiro por convite, aprovação com regra e meio de pagamento obrigatórios.
3. Indicações com os 7 status e bloqueio de CNPJ duplicado.
4. Fechamento mensal: conferir, marcar quem paga, fechar lote, saldo pendente que carrega.
5. Painel do parceiro com "dados atualizados em".

Perfis nesta fase: Diretor, Parceiro, Analista de dados. Vendedor é fase 2; contador é parceiro com prazo.
