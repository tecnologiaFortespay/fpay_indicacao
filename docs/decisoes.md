# Decisões posteriores ao requisitos.md

O `docs/requisitos.md` não é alterado. As decisões tomadas depois dele ficam aqui, com data, e
valem sobre o que ele diz.

## 28/10/2026 — Diego

1. **O MVP é o roteiro de validação.** O roteiro em `docs/roteiro-validacao.md` define o que o
   sistema faz nesta fase; o teste de ponta a ponta `e2e/roteiro.spec.ts` executa os mesmos passos.
2. **Configuração do parceiro e configuração da indicação.** Valor por vida e prazo em meses são
   cadastrados pelo diretor. O parceiro tem a sua regra, com vigências; cada indicação pode ter
   valor por vida e prazo próprios. Campo em branco na indicação usa a regra do parceiro vigente
   no mês. O prazo conta a partir do primeiro mês pago da indicação.
3. **Meio de pagamento não é exigido.** O cadastro e a aprovação do parceiro não pedem mais meio
   de pagamento (os campos saíram). No fechamento, cada parceiro marcado para pagar tem um campo
   livre "Como foi pago", preenchido pelo diretor e visto pelo parceiro em Meus fechamentos.
4. **Objetivo da plataforma.** Facilitar a vida do diretor e deixar visível para cada parceiro o
   valor dele, para o diretor não precisar responder a cada pedido. Por isso o painel do parceiro
   mostra, por indicação, vidas, valor por vida, valor e prazo.

## 28/10/2026 — recomendações aplicadas (aprovadas pelo Diego: "faça sua recomendação")

5. **Fechamentos em ordem.** Um mês só é preparado ou fechado quando todos os meses anteriores com
   importação já estão fechados.
6. **Vigências.** Só a vigência mais recente do parceiro pode ser editada ou removida, e só
   enquanto nenhum mês fechado a usa. As anteriores ficam como histórico. O parceiro ativo nunca
   fica sem vigência.
7. **Painel do parceiro.** No mês escolhido aparecem as indicações com vidas contando e as ativas
   ou inadimplentes que já começaram a pagar (inadimplente com 0 vidas, para ser cobrado).
   Perdidas, canceladas e as que ainda não pagaram ficam em Minhas indicações.
8. **Mês fechado não muda.** Mudar a configuração de uma indicação vale para os meses abertos. O
   valor de um mês fechado é o do fechamento, que o painel indica quando o mês já foi fechado.

## 29/10/2026 — correções pedidas pelo Diego

9. **Envios parciais do BI.** O diretor envia o export do mês em andamento três ou quatro vezes por
   semana; cada arquivo traz as vidas do mês até aquele dia, para o parceiro acompanhar o valor
   atualizado. Cada envio substitui o mês (nunca soma). Envio do mês em andamento é parcial: ativa
   as indicações que aparecem, mas não marca inadimplência, porque o cliente ainda pode pagar até o
   fim do mês. O envio feito depois que o mês termina completa o mês: libera o fechamento e marca
   como inadimplente a indicação ativa sem vidas nele. Importações mostram "parcial" ou "mês
   completo". Confirmado pelo Diego em 09/11/2026: cada export parcial traz o acumulado do mês até
   o dia, não só as vidas novas desde o envio anterior.
10. **Cadastro pelo convite.** O convite válido confirma o e-mail da conta recém-criada, então o
    cadastro do parceiro conclui mesmo com "Confirm email" ligado no Supabase. Conta criada antes
    disso, sem cadastro concluído, entra com a própria senha pelo link do convite e conclui.
11. **IA só para o diretor.** Pedido do Diego, com autorização da Fortes Pay para enviar dados à
    API (não treina com eles). Duas análises: do envio da planilha (comparação com o envio anterior
    do mês e com o mês passado, e empresas do arquivo que podem ser uma indicação com CNPJ digitado
    errado) e do fechamento preparado (o que conferir antes de fechar). A IA aponta e explica; não
    calcula, não decide pagar ou acumular e não altera dados. As análises ficam na 12ª tabela
    (`ai_reviews`), lida só pelo diretor. "Pergunte aos dados" e rascunho de resposta a contestação
    ficam para depois.
12. **Nova senha pelo diretor.** O e-mail padrão do Supabase não é confiável, então, por enquanto,
    a nova senha do parceiro sai por um link que o diretor gera na ficha do parceiro ("Acesso do
    parceiro") e envia por conta própria. O link vale 24 horas e uma única vez; gerar outro
    invalida o anterior. Só o hash fica guardado (colunas em `profiles`, sem tabela nova). Para
    diretor, `npm run reset-link`. Com um SMTP próprio, o "Esqueci minha senha" volta
    a ser o caminho normal.

## 04/11/2026 — reforma de UX (aprovada pelo Diego: "reforma guiada")

13. **Etapas da indicação e glossário.** O parceiro não vê as sete situações, e sim três etapas
    que respondem "isso já rende?": **Ainda não rende** (Indicada, Em negociação, Contrato
    fechado), **Rendendo comissão** (Ativa e Inadimplente, que aparece como "Sem pagamento") e
    **Encerrada** (Perdida, Cancelada). Cada indicação traz uma frase do que está acontecendo e do
    que falta. O diretor continua vendo as sete situações, com a cor da etapa. "Fechada" (contrato
    assinado) não rende: rende a partir do primeiro mês em que o cliente paga. Os rótulos seguem um
    glossário único (`src/lib/glossary.ts`): Valor por vida (R$), Vale a partir de, Prazo (meses),
    Vidas pagas, Prévia (mês em andamento) e Valor oficial (mês fechado). As regras de negócio não
    mudaram.

## 04/11/2026 — perfis (pedido do Diego)

14. **Dois perfis: diretor e parceiro.** O perfil de analista de dados sai (`docs/requisitos.md`,
    seção 2, previa que ele só importasse). Quem exporta e envia a planilha do BI usa o perfil de
    diretor, com o mesmo acesso: vê tudo, envia a planilha, pode fechar o mês e mudar regras, e a
    análise da IA roda em todo envio. Recomendação registrada: um login de diretor por pessoa, para
    o histórico (quem enviou, quem preparou, quem fechou, quem decidiu) mostrar quem fez cada coisa.
    No banco, a migration `20261104000012_two_profiles.sql` converte quem fosse analista em
    diretor, tira o perfil das políticas e da importação e só aceita `director` e `partner`.

## 09/11/2026 — arquivo em CSV e conferência antes de gravar (pedido do Diego)

15. **O arquivo do BI chega em CSV.** O modelo que vai ser enviado é o mesmo "Detalhamento
    Empresas" salvo como CSV pelo Google Planilhas ("Planilha sem título - Export.csv"). A
    importação aceita .csv e .xlsx. No CSV o nome do grupo e da empresa aparece só na linha de
    subtotal (a linha do CNPJ vem em branco), os números vêm formatados ("2.657", "R$ 5.906") e o
    rodapé "Filtros aplicados" é uma célula de várias linhas; o leitor trata os três casos e
    também o CSV do Excel em português (";" e Windows-1252). A coluna de vidas continua sendo
    `C. Cash-in` (decisão 17).
16. **Conferir antes de gravar.** O envio passa a ter duas etapas: **Conferir arquivo** mostra,
    sem gravar nada, cada indicação com as vidas de hoje e as do arquivo, a mudança de situação
    (ex.: Fechada → Ativa), o valor do mês antes e depois, os totais por parceiro, as indicações
    que não aparecem no arquivo e as linhas que não entram; **Confirmar e importar** grava o
    mesmo arquivo (a impressão do arquivo é conferida). A conferência roda a própria
    `import_lives` dentro de um bloco desfeito no fim (função `preview_import`, migration
    `20261109000013_import_preview.sql`), então mostra exatamente o que a importação faria, sem
    repetir as regras em outro lugar. Nenhuma tabela nova.
17. **"C. Cash-in" são as vidas pagas do mês.** Confirmado pelo Diego em 09/11/2026 ("cash in são
    vidas pagas"). Fecha a hipótese aberta desde 28/10/2026; "Contas Cad" não é usada.

## 09/11/2026 — pendências respondidas pelo Diego

18. **O primeiro mês a fechar é escolha do diretor.** Nem o sistema nem a Fortes Pay fixam um mês
    inicial. O primeiro fechamento é o do mês mais antigo que recebeu a planilha do BI depois de
    terminar; dali em diante valem a ordem (decisão 5) e o saldo acumulado. Para começar em um mês,
    basta não enviar planilhas de meses anteriores a ele: mês sem envio não precisa ser fechado e
    não bloqueia os seguintes. Se um dia for preciso ter envios de meses anteriores sem fechá-los,
    isso vira um ajuste (anotado em `docs/depois.md`).

## 09/11/2026 — acesso e senha sem e-mail (pedido do Diego)

19. **Equipe e Minha conta.** Nos testes, a redefinição de senha do diretor falhou: "Esqueci minha
    senha" dependia do e-mail do Supabase, que não chega. Como o sistema não envia e-mail e tudo é
    configurado pelo diretor, o acesso passa a ter três peças, no mesmo jeito do convite de
    parceiro: (a) **Minha conta** (diretor e parceiro, ao lado de Sair): troca da própria senha com
    senha atual, nova e confirmação; (b) **Equipe** (menu do diretor): lista dos diretores,
    **Convidar diretor** (link de 7 dias e uso único; quem abre cria o próprio acesso e entra
    direto, sem aprovação: o convite já é a aprovação) e **Gerar link de nova senha** para outro
    diretor (24 horas, uso único, igual ao do parceiro); (c) **Esqueci minha senha** deixa de ter
    formulário e explica o caminho pelo diretor. Todos os diretores são iguais (quem envia a
    planilha do BI também é diretor): qualquer um convida e gera link para outro, e fica registrado
    quem fez; o Diego não quis um "super diretor". `npm run bootstrap` fica para o primeiro diretor
    de um ambiente novo e como último recurso. No banco, a migration
    `20261109000014_team_access.sql`: tipo `director` em `invitations`, funções `register_director`,
    `list_directors` e `change_my_password` (bcrypt, como o link); nenhuma tabela nova.

## 09/11/2026 — reunião de apresentação com o cliente (seis ajustes, plano aprovado pelo Diego)

20. **"Virou cliente" para o parceiro.** O parceiro com indicações e nenhuma vida paga via só "0"
    e não sabia o andamento. Passa a ver um resumo em números, em Minhas indicações e na prévia
    zerada do painel: "N indicações · X viraram cliente · Y em andamento · Z perdidas". Definição
    do Diego (09/11/2026): **virou cliente** = Contrato fechado, Ativa, Inadimplente ou Cancelada
    (chegou a ser cliente); **em andamento** = Indicada ou Em negociação; **perdida** = Perdida. É
    só leitura das situações já existentes; nenhuma regra de cálculo muda. No mesmo lote, a lista
    de indicações do diretor ganhou busca por CNPJ ou empresa e o seletor de mês das vidas (o
    "relatório de quem indicou cada cliente" já era essa lista; o cadastro de indicadores é
    Parceiros).
21. **"Atualizado em" por mês e últimos envios para o parceiro.** Na reunião, a data pareceu não
    mudar. Não havia defeito: a data mostrada era a do **último envio de qualquer mês**, aparecia
    só no cartão de mês aberto, e uma aba já aberta não se atualiza sozinha (é preciso recarregar).
    Agora o painel mostra a data do último envio **do mês escolhido** (ou "Ainda não houve envio da
    planilha de <mês>"), também no cartão de mês fechado, e a lista **Últimos envios da planilha**
    (data/hora, mês e "parcial" ou "mês completo"), para o parceiro saber sozinho se o que espera já
    entrou; Minhas indicações diz de quando é a base das vidas. No banco, `last_import_at(mês)` e
    `recent_imports` (só data e meses, sem arquivo nem autor; migration
    `20261110000015_import_stamps.sql`). Nenhuma tabela nova; importação e cálculo intocados.
22. **Vendedor na indicação e fechamento em dois níveis.** (1) Não existia vendedor no sistema; o
    único nome por parceiro era o Responsável. Decisão do Diego (09/11/2026): o vendedor é **de cada
    indicação**, como `docs/requisitos.md` L48 já previa — um texto opcional, informado por quem
    registra a indicação (parceiro ou diretor) e corrigido só pelo diretor na ficha da indicação.
    Login e comissão de vendedor continuam fase 2 (sem `sellers`). (2) No fechamento, cada linha de
    parceiro passa a abrir "Ver clientes (n)": os clientes do mês com vidas, valor por vida, valor e
    vendedor; a linha do parceiro mostra os vendedores do mês. O detalhe é **gravado junto do
    cálculo** (coluna `closing_items.details`, preenchida por `prepare_closing` no mesmo insert), por
    isso a soma dos clientes é sempre o valor do parceiro e o mês fechado continua lendo o que foi
    gravado, mesmo que a indicação mude de valor ou situação depois (decisão 8). O cálculo em si não
    muda. Migration `20261110000016_sellers_and_closing_details.sql`; nenhuma tabela nova.
23. **Regra por parceiro ou por cliente, com vigências; a regra do parceiro é a da data da
    indicação.** Até aqui a vigência do parceiro valia por mês para todos os clientes dele
    (`requisitos.md` L83). Decisão do Diego (09/11/2026): a vigência nova vale **para quem for
    indicado a partir dela**; indicações anteriores seguem a regra anterior. Interpretação do Claude
    (10/11/2026, **a confirmar com o Diego**): a comparação é por **mês**, porque "Vale a partir de"
    já é um mês. Para cada indicação e mês vale a vigência mais recente do parceiro que (a) já vale
    no mês e (b) já existia no mês em que a indicação foi feita; se nenhuma existia, a primeira que
    passou a valer. Uma vigência nova nunca muda um mês anterior a ela (meses fechados continuam
    travados). A indicação pode ter **vigências próprias** (valor e/ou prazo), por mês, na mesma
    tabela (`partner_rules.referral_id`) e com as mesmas regras (só a mais recente muda; mês fechado
    trava): elas substituem o valor único de antes (`referrals.value_per_life`/`term_months`, migrado
    para uma vigência a partir do primeiro mês que contou, sem mudar totais) e também o item
    "histórico da configuração" de `depois.md`. O "valor por vida" do parceiro num mês passa a
    significar a regra para indicações novas naquele mês; o valor do mês continua a soma por
    indicação. Sobrepõe a decisão 2 e o L83. Migration `20261110000017_rules_by_referral_date.sql`;
    nenhuma tabela nova. No roteiro os valores não mudam, porque todas as indicações são feitas em
    [M0]; o teste de banco prova o caso da indicação anterior.
24. **O primeiro pagamento informado pelo BI ("Prim cashin") escolhe a regra e conta o prazo.**
    Apontamento da área (14/11/2026) ao carregar as indicações antigas de Teresina: o parceiro tem
    R$ 1,00 com 12 meses desde junho de 2024 e R$ 2,00 sem prazo desde outubro de 2026; as
    indicações foram cadastradas agora, então todas caíram nos R$ 2,00 (a regra era escolhida só
    pela data do cadastro, decisão 23) e o prazo contava do primeiro mês com planilha na
    plataforma. Agora a importação lê a coluna "Prim cashin" e guarda o mês em
    `referrals.first_cashin`. Interpretação do Claude (**a confirmar com o Diego e o Denis**): a
    regra do parceiro é escolhida pelo **mês mais antigo entre o da indicação e o do primeiro
    pagamento**, de modo que a decisão 23 continua valendo para indicações novas (indicada em
    setembro, paga em novembro: regra de setembro) e a carga de clientes antigos segue a regra da
    época. O primeiro mês pago da indicação (de onde o prazo conta) nunca fica depois do "Prim
    cashin". Consequência: empresa que já pagava há mais tempo que o prazo da regra não rende.
    Vale a partir do próximo envio da planilha de cada mês aberto; meses fechados não mudam.
    Migration `20261114000018_first_cashin.sql`; nenhuma tabela nova.

## 16/11/2026 — apontamentos do time da Fortes Pay (quatro ajustes, pedidos pelo Diego)

25. **Cadastro aberto do parceiro, sem convite.** Apontamento do time: em vez de o diretor gerar
    um link para cada parceiro, o parceiro entra no site e cria a própria conta; o diretor só
    confirma. A tela de entrada ganhou **Criar conta de parceiro** (`/cadastro`): nome da unidade
    ou do parceiro, cidade/UF, responsável, telefone, e-mail, senha e confirmação da senha. O
    cadastro nasce **Aguardando aprovação**, como antes, e o parceiro vê "Cadastro em análise". O
    tipo (Unidade ou Parceiro externo) vinha do convite; por escolha do Diego (16/11/2026) passa a
    ser definido **pelo diretor ao aprovar**, junto com a regra. Os convites de parceiro saíram: a
    tela Parceiros não tem mais "Convites" e mostra o endereço do cadastro para o diretor enviar;
    os convites que estavam abertos deixaram de valer, e quem abrir um link antigo é levado ao
    cadastro. O convite de **diretor** (Equipe, decisão 19) não muda. Como o cadastro passa a
    chegar sem o diretor ter pedido, a Visão geral avisa quantos aguardam aprovação. Chamadas do
    Claude:
    qualquer pessoa pode enviar um cadastro (a aprovação é o filtro, e o recusado fica em
    Recusados); uma conta faz um cadastro só; enquanto aguarda, o parceiro não tem tipo
    (`partners.kind` nulo). Sobrepõe a decisão 10 e o bloco 2 do roteiro. Migration
    `20261116000019_open_signup.sql`; nenhuma tabela nova.
26. **"Esqueci minha senha" por e-mail, pela caixa de suporte.** Apontamento do time: em vez de o
    diretor mandar um link, o parceiro informa o e-mail e recebe o link para criar a senha nova,
    como em qualquer site. O link é o mesmo de antes (24 horas, uso único, só o hash guardado) e
    abre a mesma tela; muda quem o gera: o próprio sistema, que o envia por SMTP pela caixa de
    suporte da Fortes Pay. A tela responde igual com ou sem cadastro (não confirma quais e-mails
    têm conta), aceita um pedido a cada 2 minutos por conta e, se o e-mail não sair, desfaz o
    link. Vale para parceiro e para diretor. O link gerado pelo diretor (ficha do parceiro e
    Equipe) **continua como reserva**, para quando o e-mail não chegar (proposta do Claude, aceita
    pelo Diego). Por escolha do Diego (16/11/2026) a configuração fica **na Vercel**: `SMTP_HOST`,
    `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` e `SUPABASE_SERVICE_ROLE_KEY`. A chave
    de serviço passa a existir no servidor (antes a regra era "nunca na Vercel"): a função que
    gera o link a partir de um e-mail só aceita essa chave, porque, se o navegador pudesse
    chamá-la, qualquer pessoa definiria o link de uma conta alheia. Ela é lida em um arquivo só
    (`src/lib/supabase/admin.ts`) e nunca vai ao navegador. Enquanto as variáveis não estiverem
    no servidor, a tela explica o caminho pelo diretor (como na decisão 19) e `/status` mostra
    `"email": "desligado: falta …"`. O link do e-mail usa o domínio de produção informado pela
    Vercel. Sobrepõe a decisão 12 e o item (c) da 19. Migration
    `20261116000020_password_reset_email.sql`; nenhuma tabela nova.
27. **Vigência do parceiro escolhida por empresa, na tela do envio da planilha.** Apontamento do
    time: há empresas novas que pagam no começo de outubro, mas a vigência que deve valer para
    elas é a de setembro; são casos pontuais, de avaliação manual. Resposta do Diego (16/11/2026):
    o diretor **escolhe qual vigência do parceiro vale para a empresa** (não digita valor nem muda
    o mês das vidas). O detalhe de cada envio ganhou **Empresas com vidas em <mês>**: cada empresa
    indicada com vidas no mês, o parceiro, quando foi indicada, o primeiro pagamento do BI, a
    vigência aplicada e o valor do mês, com as empresas novas (primeiro mês pago) no topo. Em
    "Vigência aplicada" o diretor escolhe uma das vigências cadastradas do parceiro ou
    "Automática" (decisões 23 e 24) e clica em Aplicar; o valor muda na hora, também para o
    parceiro. A mesma escolha aparece na ficha da indicação ("Vigência do parceiro aplicada"). No
    banco, `referrals.rule_month` guarda o mês da vigência escolhida e entra no lugar do mês de
    referência automático; a vigência própria da indicação continua mandando sobre a do parceiro.
    Chamadas do Claude (**a confirmar com o Diego**): (a) o seletor só aparece quando o parceiro
    tem mais de uma vigência; (b) indicação que já teve vidas num **mês fechado** não troca de
    vigência por aqui, porque o fechamento guardou os valores (decisões 6 e 8): para mudar dali
    em diante usa-se a vigência própria da indicação. Migration
    `20261116000021_rule_choice.sql`; nenhuma tabela nova.
28. **Confirmação de senha no cadastro.** O campo "Confirmar senha" já estava no ar desde
    14/11/2026 (o teste do time foi anterior a essa publicação). Continua na tela nova de criar
    conta e no convite de diretor, com a explicação de que serve para evitar erro de digitação;
    senhas diferentes são recusadas antes de a conta nascer.

## 22/11/2026 — lista da área de negócio (12 ajustes, pedidos pelo Diego)

29. **Conta de vendedor.** Pedido da área: a unidade registrava as indicações e escrevia o nome do
    vendedor; passa a existir a conta do vendedor, que só vê as próprias indicações e registra
    indicação nova com o e-mail dele como identificador. Quando a unidade registra, o vendedor é o
    e-mail da própria unidade. Com isso o campo "Vendedor" saiu do formulário de indicação do
    parceiro. Escolhas do Diego (22/11/2026): (a) o vendedor **solicita a conta** numa tela pública
    (`/cadastro/vendedor`, a partir de "Solicitar criação de conta"), informando o seu nome e o
    **e-mail da unidade** a que pertence, e o **diretor aprova** em Parceiros; (b) o vendedor vê o
    **andamento** das indicações dele e as **vidas pagas do mês**, e **nenhum valor em reais**
    (nem valor por vida, nem valor, nem prazo, nem comissão). O vendedor tem um menu só (Minhas
    indicações) e a Minha conta; não vê painel, fechamentos nem cadastro. Chamadas do Claude:
    o vendedor é um terceiro perfil em `profiles` (papel `seller`, ligado ao parceiro, com
    situação pendente/ativo/sem acesso), **sem tabela nova**; ele não lê tabela nenhuma (nenhuma
    regra de acesso mudou) e a lista dele sai de uma função que devolve só as colunas sem valor;
    a unidade é achada pelo e-mail com que ela entra no sistema ou, se for de um parceiro só,
    pelo e-mail de contato; qualquer parceiro ativo pode ter vendedor; uma conta tem um perfil só
    (o e-mail da unidade não pode ser também vendedor); o diretor também recusa o pedido, remove
    o acesso, libera de novo e gera o link de nova senha do vendedor, tudo na ficha do parceiro;
    a Visão geral avisa quantos vendedores aguardam aprovação. **Não mudou:** os formulários do
    diretor continuam com o campo Vendedor em texto livre e ele continua corrigindo o vendedor
    na ficha da indicação (decisão 22); as indicações já registradas ficam com o texto que
    tinham. Comissão de vendedor continua fora (fase 2). Sobrepõe o trecho "login e comissão de
    vendedor ficam para a fase 2" da decisão 22, só quanto ao login. Migration
    `20261122000023_seller_profile.sql`; nenhuma tabela nova.
30. **Reabrir um mês fechado.** Pedido da área, para corrigir erro depois do fechamento. Escolha
    do Diego (22/11/2026): o lote volta para **Em preparação** com os mesmos valores e ajustes; a
    decisão pagar/acumular, a resposta do parceiro e o "como foi pago" são **apagados**, porque os
    valores podem mudar, e o parceiro responde de novo quando o mês fechar outra vez. Só o
    **último mês fechado** reabre (os meses fecham em ordem, decisão 5): com um mês posterior
    fechado, reabre-se ele antes. Enquanto está reaberto, o mês sai de Meus fechamentos do
    parceiro (volta a ser prévia), aceita planilha e vigência de novo, e o mês seguinte não fecha
    nem recalcula. Chamadas do Claude: quem reabriu e quando ficam nos campos de preparo do lote
    (não há tabela de histórico); se o mês seguinte já estava em preparação, o saldo anterior dele
    é atualizado quando o mês reaberto fecha de novo. Sobrepõe a decisão 8 ("mês fechado não
    muda") só neste caminho explícito. Migration `20261122000022_reopen_and_closed_imports.sql`;
    nenhuma tabela nova.
31. **Planilha de mês fechado é recusada.** Pedido da área. Antes o envio era aceito e as linhas
    ficavam registradas como "Mês já fechado", sem mudar nada; agora o sistema **recusa o
    arquivo** já em Conferir arquivo, com a orientação de reabrir o lote (decisão 30). Os envios
    antigos que ficaram como "nada entrou (mês já fechado)" continuam no histórico. Mesma
    migration da decisão 30.
32. **Ajustes de tela da mesma lista.** (a) Telefone do cadastro com máscara `(DDD) 9XXXX-XXXX`
    (aceita também fixo, com 8 dígitos) e gravado nesse formato; (b) o link da tela de entrada
    passou de "Criar conta de parceiro" para **"Solicitar criação de conta"** (a tela do cadastro
    mantém o título); (c) "Vidas pagas até o dia N" do painel do parceiro segue a regra **D-1**
    (até ontem; no dia 1 mostra "ainda sem dia fechado"); (d) o **seletor de mês** troca o mês
    assim que é escolhido, sem o botão "Ver mês", nas quatro telas que o têm; (e) **total** de
    vidas e de valor na tabela Minhas indicações do painel e em "Ver clientes" do fechamento;
    (f) no fechamento, os **checkboxes de quem recebe** ficam ao lado do nome do parceiro, na
    tabela, **já marcados**, com um no cabeçalho para marcar/desmarcar todos (antes ficavam num
    quadro à parte, desmarcados); (g) no painel do parceiro, o **saldo acumulado** e o **saldo
    total** (previsto + acumulado) ficam dentro do cartão Valor previsto, e a seção "Meses
    fechados (valor oficial)" saiu. Chamadas do Claude: o aviso "Confira o valor de <mês> e
    responda em Meus fechamentos" foi mantido no painel, porque é o que chama o parceiro a
    responder; o saldo mostrado é o do último mês fechado antes do mês escolhido, a mesma conta
    do "saldo anterior" do fechamento.
