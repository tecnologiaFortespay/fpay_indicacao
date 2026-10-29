# Roteiro de validação — Plataforma de Indicação Fortes Pay

Roteiro escrito pelo Diego em 28/10/2026; é a definição do MVP (`docs/decisoes.md`). Os blocos 1 a 9
são o texto dele. O bloco 10 cobre as decisões do mesmo dia: configuração da indicação e "como foi
pago". O teste `e2e/roteiro.spec.ts` executa todos os passos, com exports sintéticos no formato do BI.

Formato: ação → resultado esperado. Execute em ordem; cada bloco usa o que o anterior criou. Hoje é
outubro: setembro e agosto são meses fecháveis; outubro não.

## Material

- Contas: diretor e analista criadas por `npm run bootstrap` (no ambiente local:
  `npm run bootstrap:local`, veja "Como rodar à mão" no fim).
- Três exports do BI "Detalhamento Empresas" (Excel, como sai do Power BI): agosto, setembro e
  outubro. Em cada um, anote 4 CNPJs que você vai indicar (A, B, D, E) e os valores de C. Cash-in
  deles. O CNPJ C será indicado mas não existe em nenhum export.
- Banco limpo (`tests/reset-data.sql`; no ambiente local, `npm run db:clean`).

## Bloco 1 — Acesso

1.1. Abrir / sem login → tela de login; /inicio, /parceiros, /fechamento redirecionam para login.
1.2. Entrar como diretor → cai em Visão geral; menu: Visão geral, Parceiros, Indicações, Importações, Fechamento do mês.
1.3. Entrar como analista → cai em Importações; menu só com Importações. Digitar /parceiros → volta para Importações.
1.4. Esqueci minha senha com o e-mail do analista → e-mail no Mailpit (127.0.0.1:54344) → link abre Definir nova senha → entrar com a nova senha funciona; a antiga não.

## Bloco 2 — Convite e aprovação (3 parceiros)

2.1. Diretor → Parceiros → não existe botão "Novo parceiro". Convites → Gerar convite: "Unidade Teresina", tipo Unidade, validade 7 dias → link exibido uma única vez; copiar.
2.2. Janela anônima → abrir o link → tela "Cadastro · Unidade Teresina" com validade. Preencher responsável, cidade/UF, telefone, e-mail, senha → Cadastro em análise. Tentar /inicio nessa sessão → continua em "Cadastro em análise".
2.3. Abrir o mesmo link de novo → "Convite já utilizado". Trocar um caractere do token → "Convite inválido".
2.4. Diretor → Parceiros → Aguardando aprovação → Teresina. Aprovar cadastro sem valor por vida → bloqueado com mensagem.
2.5. Aprovar com valor por vida 1,50, vigência agosto/2026, prazo em branco → ficha vira Ativo com a vigência listada.
2.6. Na janela do parceiro, recarregar → entra em Meu painel com "Unidade Teresina".
2.7. Repetir 2.1–2.5 para Unidade Natal: valor 2,00, vigência agosto/2026, prazo em branco.
2.8. Repetir para Contador Fulano (tipo Parceiro externo): valor 1,50, vigência agosto/2026, prazo 12 meses.
2.9. Gerar convite "Unidade Recusa", cadastrar, e como diretor Recusar cadastro com motivo → parceiro vê "Cadastro não aprovado" + motivo; não aparece em Ativos.
2.10. Diretor → Teresina → Nova vigência: 1,80 a partir de outubro/2026 → lista mostra 1,50 (ago) e 1,80 (out); a de agosto não tem botão editar.
2.11. Entrar como Teresina → ficha própria é só leitura; nenhuma ação de regra.

## Bloco 3 — Indicações

3.1. Teresina → Minhas indicações → Nova indicação: CNPJ A, empresa, vidas estimadas 40 → status Indicada com data.
3.2. Teresina indica B e C.
3.3. Natal indica D.
3.4. Contador Fulano indica E.
3.5. Natal tenta indicar A → "CNPJ já indicado em dd/mm/aaaa", sem o nome de Teresina; nada gravado (lista de Natal não muda).
3.6. Diretor → Indicações → 5 linhas, cada uma com o parceiro. Diretor tenta registrar A em nome de Natal → mensagem traz "por Unidade Teresina".
3.7. Diretor muda A: Indicada → Em negociação → Fechada. Só as transições permitidas aparecem no menu (ex.: Cancelada não aparece antes de Ativa).
3.8. Diretor marca C como Perdida.
3.9. Teresina recarrega → vê A como Fechada e C como Perdida; não há ação de mudar status para ela.
3.10. Natal → Minhas indicações → só D. Nada de Teresina.

## Bloco 4 — Importação (agosto e setembro)

4.1. Analista → Importações → mês de referência agosto/2026 → enviar o export de agosto → detalhe do lote: linhas lidas, importadas (só A, B, D, E), fora da plataforma (todas as outras empresas do BI, sem gravar), ignoradas (CPF/CNPJ inválido, com motivo).
4.2. Escolher setembro e enviar o export de agosto → recusado: rodapé "Filtros aplicados" não bate com o mês informado.
4.3. Enviar o export de agosto de novo para agosto → novo lote; vidas de A, B, D, E iguais às de 4.1 (substituiu, não somou).
4.4. Mês setembro → enviar export de setembro → lote OK.
4.5. Mês novembro (futuro) → recusado.
4.6. Diretor → Importações → vê os lotes com data/hora e quem subiu; abre o detalhe. Analista não vê Parceiros/Indicações (repetir 1.3).
4.7. Diretor → Indicações → A, B, D, E = Ativa (primeiro mês pago registrado). C continua Perdida.

## Bloco 5 — Cálculo e painéis

5.1. Diretor → Visão geral → agosto/2026: tabela com Teresina (A+B vidas × 1,50), Natal (D × 2,00), Contador (E × 1,50); total geral = soma; "Dados atualizados em … por …" = último lote.
5.2. Trocar para setembro: valores recalculados com as vidas de setembro.
5.3. Teresina → Meu painel → agosto: só A e B; valor a receber = vidas × 1,50; carimbo "Dados atualizados em". Nenhuma linha de Natal/Contador.
5.4. Contador → Meu painel → mostra prazo da regra (12 meses a partir de ago/2026 → até jul/2027).
5.5. Analista sobe de novo o export de setembro com A alterado (+8 vidas) → Teresina recarrega: vidas e carimbo mudaram.

## Bloco 6 — Fechamento de agosto (com acúmulo)

6.1. Diretor → Fechamento do mês → outubro → Preparar cálculo bloqueado ("mês ainda não encerrado").
6.2. Setembro com agosto aberto → bloqueado ("feche agosto primeiro").
6.3. Agosto → etapa 01 confirma que existe importação de agosto feita após 31/08 → Preparar cálculo → tabela: por parceiro ativo, vidas, valor por vida, valor do mês, ajuste, saldo anterior (0), total.
6.4. Em Natal: ajuste -10,00 com motivo → Salvar ajuste → total de Natal cai 10. Recalcular → ajuste permanece.
6.5. Fechar lote sem confirmar a conferência → bloqueado. Confirmar; marcar Teresina e Natal para Pagar; não marcar Contador → fechar.
6.6. Agosto = Fechado. Teresina e Natal "Pagar"; Contador "Acumular".
6.7. Visão geral → saldo pendente = valor do Contador em agosto, na linha dele e no total.
6.8. Analista reenvia export de agosto → linhas aparecem como ignoradas "Mês já fechado"; nada muda no fechamento.
6.9. Diretor tenta criar vigência para o Contador com início em agosto → recusado (mês fechado). Com início em outubro → aceito.
6.10. Teresina → Meus fechamentos → agosto: vidas, valor, ajuste (nenhum), saldo anterior 0, total, "Pagar" → Confirmar valor.
6.11. Natal → Meus fechamentos → agosto mostra o ajuste de -10 com o motivo → Contestar com texto. Contestar sem texto → bloqueado.
6.12. Contador → Meus fechamentos → agosto: "Acumulado para o próximo mês", valor X.
6.13. Diretor → Fechamento → agosto → coluna "Resposta do parceiro": Teresina confirmou (data), Natal contestou (texto), Contador sem resposta.

## Bloco 7 — Fechamento de setembro (saldo carrega)

7.1. Diretor → Fechamento → setembro → Preparar cálculo → Contador: saldo anterior = X (agosto) + valor de setembro = total. Teresina e Natal: saldo anterior 0.
7.2. Marcar os três → confirmar → fechar → Contador "Pagar" com o total acumulado; Visão geral → saldo pendente = 0.
7.3. Fechamentos (lista) → agosto e setembro com data de preparo, data de fechamento e quem fechou. Abrir agosto → cada linha guarda valor do mês, ajuste, saldo anterior, total, decisão, data, quem decidiu.
7.4. Teresina → Meu painel → outubro: A conta com 1,80 (nova vigência); setembro continua 1,50 no histórico.

## Bloco 8 — Outubro em andamento (envios parciais)

Regra de 29/10/2026: o diretor envia o export do mês em andamento três ou quatro vezes por semana, cada um com as vidas do mês até aquele dia. Cada envio substitui o mês (nunca soma) e atualiza a prévia dos parceiros. Envio do mês em andamento é **parcial**: ativa quem aparece, mas não marca inadimplência, porque o cliente ainda pode pagar até o fim do mês. O envio feito **depois que o mês termina** completa o mês: libera o fechamento e marca como Inadimplente a indicação ativa sem vidas.

8.1. Analista → mês outubro → enviar export de outubro sem o CNPJ B → lote OK, mês "outubro (parcial)".
8.2. Diretor → Indicações → A, B, D, E = Ativa (o arquivo parcial não marca inadimplência).
8.3. Teresina → Meu painel → outubro: B com 0 vidas até agora; A com vidas × 1,80.
8.4. Analista → enviar um novo export parcial de outubro com mais vidas em A → Teresina vê o novo número de A (substitui, não soma) e "Dados atualizados em" com o horário do envio.
8.5. Diretor muda D para Cancelada → Natal → Meu painel → outubro: D não conta vidas; agosto e setembro (fechados) inalterados.
8.6. Visão geral → "Indicações por situação" mostra 3 Ativas, 0 Inadimplente, 1 Cancelada, 1 Perdida.
8.7. (À mão, no mês seguinte) enviar o export final de outubro depois do dia 1º sem B → B = Inadimplente; o lote aparece como "mês completo". O teste automático cobre isso no banco (`tests/db/import.test.ts`).

## Bloco 9 — Isolamento

9.1. Teresina abre, pela URL, a ficha de Natal (/parceiros/<id>), /fechamento, /importacoes → volta para Meu painel; nenhum dado alheio aparece.
9.2. Analista chama a página/API de fechamento ou de regras → negado.
9.3. Parceiro pendente (gerar um novo convite e cadastrar, sem aprovar) → /inicio continua em "Cadastro em análise".
9.4. Abrir o código-fonte no navegador e buscar service_role → nada.

## Bloco 10 — Configuração da indicação e "como foi pago" (decisões de 28/10/2026)

10.1. Diretor → Indicações → abrir A → Configuração da indicação: valor por vida 2,50 e prazo 3 meses → salvo; a lista mostra "R$ 2,50 por vida · 3 meses".
10.2. Visão geral → outubro: Teresina passa a contar A × 2,50; o fechamento de agosto continua com o valor fechado.
10.3. Teresina → Meu painel → outubro: A com R$ 2,50 por vida e prazo "3 meses: ago/2026 a out/2026".
10.4. Diretor apaga os dois campos de A → A volta à regra do parceiro (1,80, sem prazo) no painel de Teresina.
10.5. Diretor → Fechamento → agosto → em Teresina, "Como foi pago": "PIX em 05/09/2026" → Teresina → Meus fechamentos → agosto mostra "Como foi pago PIX em 05/09/2026". Linhas acumuladas não têm esse campo.
10.6. Diretor → Indicações → Registrar indicação em nome de Natal, CNPJ F, valor por vida 3,00 e prazo 6 → a lista mostra "R$ 3,00 por vida · 6 meses" com Unidade Natal.

## Bloco 11 — IA do diretor (decisão de 29/10/2026)

Exige a chave `ANTHROPIC_API_KEY` no servidor. Sem ela, as telas abaixo dizem que a IA não está ligada.

11.1. Diretor → Importações → enviar o export do mês → na página do envio aparece "Análise da IA" com "analisando"; em até um minuto, resumo e alertas.
11.2. Cadastrar uma indicação com o CNPJ de propósito errado (ex.: um dígito trocado) para uma empresa que está na planilha → novo envio → a análise aponta a empresa do arquivo com nome igual como possível CNPJ errado.
11.3. Analista → abrir a mesma página do envio → não aparece nada da IA; o envio do analista não dispara análise (o diretor pode pedir depois, sem a checagem de CNPJ).
11.4. Diretor → Fechamento → mês preparado → "Analisar com IA" → resumo e alertas do cálculo; recalcular depois mostra o aviso de que a revisão é anterior ao cálculo atual.
11.5. Parceiro → nenhuma tela mostra IA.

## Como rodar à mão (ambiente local)

```bash
npm run db:start                 # Supabase local (Docker)
npm run db:clean                 # banco limpo (tests/reset-data.sql)
npm run bootstrap:local -- --email diretor@exemplo.com --role director --name "Denis" --password "Senha-forte-1"
npm run bootstrap:local -- --email analista@exemplo.com --role analyst --name "Analista" --password "Senha-forte-2"
npm run dev:local                # http://localhost:3000 contra o Supabase local
```

E-mails (recuperação de senha) chegam no Mailpit, em http://127.0.0.1:54344. Os comandos `:local`
ignoram o `.env.local`, que aponta para o projeto da Fortes Pay.

Execução automatizada: `npm run test:e2e` (zera o banco local, faz o build e roda este roteiro e os
casos extras). No teste, os meses são relativos a hoje: "outubro" é o mês corrente e "agosto" e
"setembro" são os dois anteriores, para o roteiro continuar válido em qualquer mês.
