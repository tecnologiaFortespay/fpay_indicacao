# Roteiro de validação — Plataforma de Indicação Fortes Pay

Roteiro escrito pelo Diego em 28/10/2026; é a definição do MVP (`docs/decisoes.md`). Os blocos 1 a 9
são o texto dele, com os ajustes das decisões seguintes; os blocos 10 a 14 cobrem as decisões de 28/10
a 04/11/2026; o bloco 15 e os passos 2.1 a 2.5, 12.7, 12.8 e 14.6 seguem as decisões 25 a 27, de
16/11/2026. O teste `e2e/roteiro.spec.ts` executa os passos com planilhas sintéticas no formato do BI.

Formato: ação → resultado esperado. Execute em ordem; cada bloco usa o que o anterior criou.

## Meses do teste

O roteiro usa meses relativos a hoje, para valer em qualquer mês:

| No roteiro | Significa                                | Exemplo, se hoje for novembro/2026 |
| ---------- | ---------------------------------------- | ---------------------------------- |
| **[M-2]**  | dois meses atrás (primeiro mês fechável) | setembro/2026                      |
| **[M-1]**  | mês passado (segundo mês fechável)       | outubro/2026                       |
| **[M0]**   | mês atual, em andamento (não fecha)      | novembro/2026                      |
| **[M+1]**  | mês que vem (futuro)                     | dezembro/2026                      |

## Antes de começar

- **Banco limpo** e **uma pessoa por vez** seguindo o roteiro: dois testes ao mesmo tempo usam os
  mesmos CNPJs e os mesmos meses e um atrapalha o outro.
- Navegador **Chrome** (o seletor de mês do Firefox e do Safari é uma caixa de texto: digite AAAA-MM).
  Use janelas separadas (ou perfis) para o diretor e para cada parceiro: duas janelas anônimas
  do mesmo navegador dividem a mesma sessão.
- Dois perfis: **diretor** (quem envia a planilha do BI usa o mesmo acesso) e **parceiro**. O
  primeiro login de diretor é criado pela equipe técnica (`npm run bootstrap`); os demais, por
  convite em **Equipe** (bloco 12). O parceiro cria a própria conta (bloco 2). Cada parceiro precisa
  de um e-mail diferente, que você consiga abrir (ex.: `seunome+teresina@empresa.com.br`).
- Três planilhas do BI "Detalhamento Empresas" (Excel, como sai do Power BI): [M-2], [M-1] e [M0].
  Em cada uma, anote 4 CNPJs que você vai indicar (A, B, D, E) e o C. Cash-in deles. C e F são CNPJs
  válidos que **não** estão em nenhuma planilha (para F, use `88.999.000/1001-41`).
- O único e-mail que o sistema envia é o do "Esqueci minha senha" (passos 12.7 e 12.8). Ele exige
  o envio configurado no servidor: `/status` mostra `"email":"ligado"`. Sem isso, a tela explica o
  caminho pelo diretor e esses dois passos não se aplicam; nenhum outro passo depende de e-mail.

## Bloco 1 — Acesso

1.1. Abrir / sem login → tela de login; /inicio, /parceiros, /fechamento levam ao login.
1.2. Entrar como diretor → Visão geral; menu: Visão geral, Parceiros, Indicações, Importações, Fechamento do mês, Equipe.
1.3. Entrar com a senha errada → "E-mail ou senha incorretos.", sem dizer qual dos dois está errado.

## Bloco 2 — Cadastro e aprovação (3 parceiros)

2.1. Diretor → Parceiros. Não existe "Novo parceiro" nem convite: o parceiro cria a própria conta. Em Aguardando aprovação aparece o **endereço direto do cadastro**, para enviar ao parceiro. Janela do parceiro → tela de entrada → **Criar conta de parceiro** → abre o cadastro.
2.2. Preencher nome ("Unidade Teresina"), cidade/UF, responsável, telefone, e-mail e senha, com a **confirmação de senha diferente** → "As senhas precisam ser iguais." e nada é criado. Corrigir a confirmação → **Enviar cadastro** → **Cadastro em análise**. Tentar /inicio → continua em Cadastro em análise. Na Visão geral do diretor aparece "1 cadastro de parceiro aguardando aprovação", com o atalho **Analisar em Parceiros**.
2.3. Em outra janela, Criar conta de parceiro com o **mesmo e-mail** e outra senha → "Este e-mail já tem conta…"; nenhum cadastro novo aparece para o diretor. Um endereço de convite que não existe (/convite/…) → "Convite inválido".
2.4. Diretor → Parceiros → Aguardando aprovação → **Analisar e aprovar** em Teresina: o Tipo aparece como "a escolher na aprovação". Clicar **Aprovar e liberar acesso** sem escolher o **Tipo de parceiro** → o navegador avisa que o campo é obrigatório; escolher Unidade e clicar sem valor por vida → mesmo aviso no valor.
2.5. Tipo Unidade, valor por vida 1,50, **Vale a partir de** [M-2], prazo em branco → aviso "Parceiro aprovado. O acesso dele está liberado."; a ficha mostra Situação Ativo, Tipo Unidade e "Hoje: R$ 1,50 por vida · sem prazo · vale desde [M-2]".
2.6. Na janela do parceiro, recarregar → entra em Meu painel com "Olá, Unidade Teresina".
2.7. Repetir o cadastro e a aprovação para Unidade Natal: tipo Unidade, 2,00, a partir de [M-2], sem prazo.
2.8. Repetir para Contador Fulano: tipo **Parceiro externo**, 1,50, a partir de [M-2], prazo 12; a ficha mostra Tipo Parceiro externo.
2.9. Cadastrar "Unidade Recusa"; diretor → **Recusar cadastro** com motivo → aviso "Cadastro recusado…"; a ficha mostra o motivo e "Reconsiderar: aprovar o cadastro". O parceiro vê "Cadastro não aprovado" + motivo. Em Parceiros, Recusa aparece em Recusados e não em Ativos.
2.10. Diretor → Teresina → **Nova vigência**: 1,80 a partir de [M0] → "Regra salva."; a tabela mostra [M-2] R$ 1,50 "não, histórico" e [M0] R$ 1,80 "sim, é a mais recente"; só existe "Editar a vigência de [M0]".
2.11. Como Teresina → Meu cadastro: só leitura, com "Hoje: R$ 1,80 por vida · sem prazo · vale desde [M0]". /parceiros → volta para Meu painel.

## Bloco 3 — Indicações e etapas

3.1. Teresina → Minhas indicações → **Nova indicação**: CNPJ A, empresa, vidas estimadas 40, **Vendedor** "Carla" (opcional: quem da unidade fez a indicação) → "Indicação registrada."; os campos ficam limpos; A aparece em **Ainda não rende** com "Indicada em dd/mm/aaaa. A Fortes Pay ainda vai falar com o cliente…" e "Vendedor: Carla".
3.2. Teresina indica B e C. 3.3. Natal indica D. 3.4. Contador indica E.
3.5. Natal tenta A → "CNPJ já indicado em dd/mm/aaaa." sem o nome de Teresina; Natal continua com "Ainda não rende (1)".
3.6. Diretor → Indicações → Lista (5), cada uma com o parceiro (A com "Vendedor: Carla"). **Buscar por CNPJ ou empresa**: o nome de A → só A; o CNPJ de B (com ou sem pontuação) → só B; limpar → as 5 de novo. **Registrar indicação em nome de um parceiro**: A em nome de Natal → mensagem cita "por Unidade Teresina".
3.7. Diretor muda A: Indicada → Em negociação → Fechada (aviso "Situação atualizada." a cada vez). O menu só mostra as mudanças permitidas (Cancelada não aparece antes de Ativa).
3.8. Diretor marca C como Perdida.
3.9. Teresina recarrega → A em Ainda não rende como **Contrato fechado** ("Começa a render no primeiro mês em que o cliente pagar"); C em **Encerradas (1)**. Nenhum botão de mudar situação.
3.10. Natal → só D.
3.11. Teresina → Minhas indicações → **Resumo**: "3 indicações · 1 virou cliente · 1 em andamento · 1 perdida" (virou cliente = contrato fechado ou já pagou, inclusive cancelada; em andamento = indicada ou em negociação; perdida = perdida). Meu painel, ainda sem nenhuma vida paga: a prévia diz "Nenhuma vida paga em [M0]." e repete o resumo, em vez de só "0"; como nenhuma planilha foi enviada, o rodapé diz "Ainda não houve envio da planilha de [M0]."
3.12. Diretor → Indicações → B → ficha da indicação → **Vendedor** "Bruno" → **Salvar vendedor** → "Vendedor salvo."; a lista mostra "Vendedor: Bruno" em B. Só o diretor corrige o vendedor depois de registrado.

## Bloco 4 — Importação ([M-2] e [M-1])

4.0. Diretor → Importações → Mês de referência [M-2] → planilha de [M-2] → **Conferir arquivo** → "Confira antes de importar": indicações no arquivo (A, B, D, E) com vidas de hoje (0) e do arquivo, A "Fechada → Ativa" com o valor do mês, totais por parceiro. **Cancelar** → nenhum envio na lista.
4.1. Diretor → Importações → Mês de referência [M-2] → planilha de [M-2] → Conferir arquivo → **Confirmar e importar** → detalhe do envio: linhas lidas, importadas (só A, B, D, E), fora da plataforma (as outras empresas, sem gravar), ignoradas (CPF/CNPJ inválido, com motivo).
4.2. Escolher [M-1] e enviar a planilha de [M-2] → recusado: o rodapé "Filtros aplicados" não bate com o mês.
4.3. [M-2] de novo → envio novo; vidas iguais (substitui, não soma).
4.4. [M-1] → planilha de [M-1] → OK.
4.5. Mês [M+1] → o navegador recusa mês futuro.
4.6. Diretor → Importações → envios com data, hora e quem enviou; o detalhe de cada envio abre.
4.7. Diretor → Indicações → A, B, D, E **Ativa** com "Rende desde [M-2]". C Perdida.

## Bloco 5 — Cálculo e painéis

5.1. Diretor → Visão geral → [M-2]: Teresina (A+B × 1,50), Natal (D × 2,00), Contador (E × 1,50); total = soma; "Planilha do BI enviada em … por …".
5.2. [M-1]: recalculado com as vidas de [M-1].
5.3. Teresina → Meu painel → [M-2]: cartão "[M-2] · prévia" com "Regra para quem você indicar em [M-2]: R$ 1,50 por vida · sem prazo", vidas e valor previsto e "Prévia com a base do BI de …" (a data do último envio **de [M-2]**); Minhas indicações só com A e B; "Rendendo comissão" conta 2. Em Minhas indicações, a introdução diz de quando é a base do BI das vidas.
5.4. Contador → Meu painel: "Regra para quem você indicar em [M0]: R$ 1,50 por vida · prazo de 12 meses"; E com "12 meses: [M-2] a …".
5.5. Diretor envia de novo [M-1] com A +8 vidas → Teresina recarrega: vidas e "Prévia com a base do BI de …" mudam (a página não se atualiza sozinha: é preciso recarregar).
5.6. Teresina → Meu painel → **Últimos envios da planilha**: quatro envios ([M-2] duas vezes, [M-1] duas vezes), do mais novo ao mais antigo, cada um com a data/hora e o mês, marcado como "mês completo" (mês já terminado) — o parceiro sabe sozinho se o que espera já entrou.

## Bloco 6 — Fechamento de [M-2] (com acúmulo)

6.1. Diretor → Fechamento do mês → [M0] → etapa 1 "[M0] ainda não terminou"; sem botão Preparar cálculo.
6.2. [M-1] com [M-2] aberto → etapa 2 "Feche [M-2] primeiro" e botão "Ir para [M-2]".
6.3. [M-2] → etapa 1 concluída ("Planilha de [M-2] enviada em …, depois do fim do mês") → **Preparar cálculo** → tabela por parceiro: vendedor(es) do mês, vidas, valor por vida, valor do mês, ajuste, saldo anterior (0), total. Sob cada parceiro, **Ver clientes (n)** abre os clientes do mês com vendedor, vidas, valor por vida e valor: Teresina = A (Carla, 30 × 1,50 = 45,00) + B (Bruno, 20 × 1,50 = 30,00) = 75,00.
6.4. **Ajustar o valor de um parceiro**: Natal, -10,00, motivo → "Ajuste salvo."; total de Natal cai 10. Recalcular → o ajuste continua.
6.5. **Fechar lote** sem marcar a conferência → "Confirme que conferiu…". Marcar Teresina e Natal, não marcar o Contador, marcar a conferência → "Lote fechado. Nada mais entra neste mês."; título "[M-2] · Fechado"; as três etapas concluídas.
6.6. Teresina e Natal "Pagar"; Contador "Acumular".
6.7. Visão geral → "Saldo acumulado a pagar" = valor do Contador em [M-2], na linha dele e no total.
6.8. Diretor reenvia [M-2] → linhas "Mês já fechado"; o fechamento não muda.
6.9. Contador → Nova vigência a partir de [M-2] → recusada (mês fechado). A partir de [M0] → aceita.
6.10. Teresina → Meu painel → [M-2] (fechado): o cartão "valor oficial" diz "Base do BI de [M-2]: último envio em … (mês completo)" — o reenvio de 6.8 não conta, porque nada entrou. Meus fechamentos → [M-2]: vidas, valor, saldo que vinha de antes 0, total, Pagar → **Confirmar valor** → "Resposta registrada…" e "Você confirmou em …".
6.11. Natal → [M-2] mostra o ajuste -10 com o motivo. Contestar sem texto → "Explique o que não confere". Com texto → "Você contestou em …".
6.12. Contador → [M-2]: "Acumulado para o próximo mês".
6.13. Diretor → Fechamento → [M-2] → coluna "Resposta do parceiro": Teresina confirmou (data), Natal contestou (texto), Contador "aguardando".

## Bloco 7 — Fechamento de [M-1] (saldo carrega)

7.1. Diretor → Fechamento → [M-1] → Preparar cálculo → Contador: saldo anterior = valor de [M-2] + valor de [M-1] = total.
7.2. Marcar os três → conferir → fechar → Contador "Pagar" com o total acumulado; Visão geral → saldo acumulado a pagar 0.
7.3. Ainda em Fechamento do mês, seção **Fechamentos registrados**: [M-2] e [M-1] com preparo, fechamento e quem fechou. Abrir [M-2]: cada linha guarda valor do mês, ajuste, saldo anterior, total, decisão, data e quem decidiu.
7.4. Teresina → Meu painel → [M0]: "Regra para quem você indicar em [M0]: R$ 1,80 por vida"; A, indicada em [M0], conta 1,80 em [M0]; [M-1] mostra "[M-1] · valor oficial" e A continua a 1,50 lá. Uma indicação feita antes de [M0] continuaria a 1,50 também em [M0] (decisão 23; coberto no teste de banco).

## Bloco 8 — [M0] em andamento (envios parciais)

O mês em andamento pode ser enviado várias vezes; cada envio substitui o mês e atualiza a prévia. Envio do mês em andamento é **parcial**: não marca ninguém como inadimplente. O envio feito **depois que o mês termina** completa o mês e marca como Inadimplente a indicação ativa sem vidas.

8.1. Diretor → Importações → [M0] → planilha de [M0] sem o CNPJ B → envio "[M0] (parcial)".
8.2. Diretor → Indicações → A, B, D, E continuam Ativa.
8.3. Teresina → Meu painel → [M0]: B "Rendendo" com 0 vidas; A com vidas × 1,80.
8.4. Diretor → nova planilha parcial de [M0] com mais vidas em A, **em CSV** (como o Google Planilhas exporta) → a conferência mostra A com as vidas de hoje e as novas → confirmar → Teresina vê o novo número de A (substitui, não soma); em Últimos envios da planilha, o envio aparece primeiro, com [M0] marcado como "parcial".
8.5. Diretor muda D para Cancelada → Natal → [M0]: D não conta; [M-2] e [M-1] mostram o valor oficial, inalterados.
8.6. Visão geral → Indicações por etapa: Ativa 3, Inadimplente 0, Cancelada 1, Perdida 1.
8.7. (À mão, no mês seguinte) planilha final de [M0] enviada depois do dia 1º, sem B → B Inadimplente; o envio aparece como "mês completo". Coberto no teste de banco.
8.8. Diretor → Indicações → seletor **Mês** = [M-2] → coluna "Vidas em [M-2]" com A = 30; [M-1] → A = 41. Sem mês escolhido, a lista mostra o mês mais recente com planilha.

## Bloco 9 — Isolamento

9.1. Teresina abre pela URL a ficha de Natal (/parceiros/<id>), /fechamento, /importacoes → volta para Meu painel, sem dado alheio.
9.2. Parceiro pendente (cadastro novo, ainda sem aprovar) → /inicio continua em Cadastro em análise.
9.3. Ctrl+U em qualquer tela, procurar `service_role` → nada.

## Bloco 10 — Valor e prazo da indicação e "como foi pago"

10.1. Diretor → Indicações → abrir A → aviso "Rende desde [M-2]…"; **Valor e prazo desta indicação** → **Nova vigência**: valor 2,50, prazo 3, a partir de [M0] → "Vigência da indicação salva."; a lista mostra "R$ 2,50 por vida · 3 meses".
10.2. Visão geral → [M0]: Teresina conta A × 2,50; o fechamento de [M-2] continua com o valor fechado, inclusive em Ver clientes: A segue com 30 × 1,50 = 45,00 (o detalhe é o retrato do fechamento, não um recálculo).
10.3. Teresina → Meu painel → [M0]: A com R$ 2,50 e prazo "3 meses: [M-2] a [M0]".
10.4. Diretor → ficha de A → **Editar a vigência de [M0]** → **Remover esta vigência** → "Vigência removida."; A volta à regra do parceiro (1,80, sem prazo).
10.5. Diretor → Fechamento → [M-2] → Como foi pago a Unidade Teresina: "PIX em 05/…" → Teresina → Meus fechamentos → [M-2] mostra "Como foi pago". Linhas acumuladas não têm esse campo.
10.6. Diretor → Indicações → Registrar indicação em nome de Natal, CNPJ F, valor 3,00, prazo 6 → a lista mostra "R$ 3,00 por vida · 6 meses".

## Bloco 11 — IA do diretor

Exige a chave da IA no servidor (`/status` mostra `"ia":"ligada"`). Sem ela, as telas dizem que a IA não está ligada.

11.1. Diretor → Importações → enviar a planilha de [M0] → no envio, "Análise da IA" fica "analisando" e, em geral em menos de um minuto, mostra resumo e alertas.
11.2. Registrar em nome de Natal uma empresa G que **está** na planilha de [M0], com o mesmo nome do BI e o CNPJ `77.123.456/0001-73` (válido, mas errado de propósito) → novo envio de [M0] → um alerta aponta G como possível CNPJ errado.
11.3. **Faça no passo 7.1, antes de fechar [M-1]**: Fechamento → [M-1] preparado → "Analisar com IA" → resumo e alertas; recalcular depois mostra o aviso de revisão anterior ao cálculo.
11.4. Parceiro → nenhuma tela mostra IA.

## Bloco 12 — Nova senha e Equipe

12.1. (Reserva, para quando o e-mail não chega) Diretor → Parceiros → ficha de um parceiro ativo → **Acesso ao sistema** → Gerar link de nova senha → o link aparece para copiar.
12.2. Em outra janela, abrir o link → "Definir nova senha" com o nome do responsável e o e-mail → salvar → login mostra "Senha alterada" → entrar com a nova.
12.3. Abrir o mesmo link de novo → "Link inválido ou expirado".
12.4. Diretor → **Minha conta** (ao lado de Sair) → senha atual, nova senha e confirmação → **Alterar senha** → "Senha alterada". Em outra janela, entrar com a nova senha funciona; a antiga é recusada.
12.5. Diretor → **Equipe** → a lista mostra os diretores com e-mail → **Convidar diretor** → nome → Gerar convite → o link aparece para copiar. Em outra janela, abrir o link → "Cadastro · (nome convidado)", convite para diretor → e-mail de acesso e senha → **Criar acesso** → entra direto na Visão geral, com o menu completo (inclusive Equipe). De volta à Equipe, o novo diretor está na lista e o convite aparece como "Cadastro feito". Parceiro que digita /equipe volta ao próprio painel.
12.6. Diretor → Equipe → na linha de outro diretor → **Gerar link de nova senha** (na própria linha aparece "Você", sem botão). Em outra janela, abrir o link → Definir nova senha → entrar com a nova funciona.
12.7. Tela de login → **Esqueci minha senha** → informar o e-mail de Teresina → **Enviar link** → "Se este e-mail tiver cadastro, o link para criar a nova senha foi enviado…". Na caixa de entrada de Teresina chega o e-mail "Fortes Pay: crie sua nova senha", com o nome do responsável e o link → abrir → "Definir nova senha" → salvar → login mostra "Senha alterada" → entrar com a nova. Abrir o mesmo link de novo → "Link inválido ou expirado", com **Pedir um novo link**.
12.8. Esqueci minha senha com um e-mail **sem cadastro** → a mesma mensagem, e nenhum e-mail é enviado. Pedir de novo para o mesmo e-mail logo em seguida → a mesma mensagem, sem um segundo e-mail (um pedido a cada 2 minutos por conta). Diretor também recebe o link pelo e-mail dele. "Voltar ao login" leva ao login.

## Bloco 13 — O parceiro entende o que rende

13.1. Teresina → Meu painel: o aviso "Como funciona" explica os três passos (indica, rende quando o cliente paga, fecha no mês seguinte).
13.2. Em Minhas indicações, cada indicação está numa etapa (Rendendo comissão, Ainda não rende, Encerradas) com uma frase do que está acontecendo e do que falta.
13.3. Num mês fechado, o painel mostra o **valor oficial** (valor do mês, total, Pagar ou Acumulado, resposta dada); no mês em andamento, a **prévia**, com a regra do mês e a data da planilha.
13.4. O parceiro sabe quantas indicações viraram cliente sem depender de vidas pagas: o **Resumo** de Minhas indicações e a prévia zerada do painel (passo 3.11).

## Bloco 14 — Mensagens e navegação

14.1. Aprovar, recusar, remover vigência, fechar lote, responder fechamento e mudar situação mostram um aviso verde no topo da página; recarregar a página não repete o aviso.
14.2. Depois de "Indicação registrada." ou "Convite criado", os campos ficam limpos: clicar de novo não repete o cadastro.
14.3. Abrir um convite de diretor numa janela já conectada com outra conta → "Você já está conectado", com botão Sair.
14.4. Deixar uma tela aberta, sair em outra aba e salvar algo na primeira → "Sua sessão expirou. Entre de novo para continuar." e o login.
14.5. Endereço que não existe (ex.: /pagina-que-nao-existe) → "Página não encontrada" com "Ir para o início".
14.6. Link antigo de convite de parceiro (de antes de 16/11/2026) → "O cadastro agora é direto", com **Criar conta de parceiro**.

## Bloco 15 — Vigência do parceiro escolhida no envio

Teresina tem duas vigências: 1,50 desde [M-2] e 1,80 desde [M0] (passo 2.10). O caso: uma empresa nova paga pela primeira vez em [M0], mas deve seguir a vigência anterior.

15.1. Teresina → **Nova indicação**: empresa H, um CNPJ que está na planilha de [M0] e ainda não foi indicado. Diretor → Importações → enviar de novo a planilha de [M0] → no detalhe do envio, **Empresas com vidas em [M0]**: H vem no topo, com "nova: 1º mês pago" e, em Vigência aplicada, "R$ 1,80 por vida · sem prazo" e "vigência de [M0] … (automática)" (se a planilha trouxer "Prim cashin" de H anterior a [M0], a automática já é a de [M-2]). A não tem seletor: "já teve vidas em mês fechado".
15.2. Na linha de H, escolher "Vigência de [M-2] · R$ 1,50 · sem prazo" → **Aplicar** → aviso "Regra da indicação atualizada…"; a linha passa a "R$ 1,50 por vida", "(escolhida pelo diretor)", e o valor do mês = vidas × 1,50.
15.3. Teresina → Meu painel → [M0]: H a R$ 1,50.
15.4. Diretor → Indicações → H → **Vigência do parceiro aplicada** mostra a vigência de [M-2], "escolhida pelo diretor"; escolher "Automática" → Aplicar → H volta a 1,80, também no painel de Teresina. Na ficha de A não há seletor: a indicação já teve vidas num mês fechado.

## Como rodar à mão (ambiente local)

```bash
npm run db:start                 # Supabase local (Docker)
npm run db:clean                 # banco limpo (tests/reset-data.sql)
npm run bootstrap:local -- --email diretor@exemplo.com --role director --name "Denis" --password "Senha-forte-1"
npm run dev:local                # http://localhost:3000 contra o Supabase local
```

Os comandos `:local` ignoram o `.env.local`, que aponta para o projeto da Fortes Pay.

Execução automatizada: `npm run test:e2e` (zera o banco local, faz o build e roda este roteiro e os
casos extras), com os meses relativos a hoje como na tabela acima.
