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
