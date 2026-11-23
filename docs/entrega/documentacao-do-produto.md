# Plataforma de Indicação Fortes Pay — Documentação do produto

Versão de 04/11/2026 · Diego Nogueira

Este documento explica o que a plataforma faz, as regras de comissão e o que cada pessoa vê. É
escrito para a área de negócio e para o diretor. Os detalhes de implantação e manutenção estão na
[documentação técnica](documentacao-tecnica.md).

## 1. Para que serve

A plataforma substitui a planilha de indicações e comissões. Ela responde, para cada mês:

- quem indicou cada cliente (pelo CNPJ);
- quantas vidas de cada cliente indicado pagaram a Fortes Pay no mês (pela planilha do BI);
- quanto cada parceiro tem a receber (vidas pagas × valor por vida).

O diretor entra, acompanha e fecha o mês. Cada parceiro vê o próprio valor a qualquer momento,
sem precisar perguntar à Fortes Pay.

## 2. Quem usa

| Perfil       | Quem é                                                         | O que faz                                                                                                                                        |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Diretor**  | Gestão da Fortes Pay e quem envia a planilha do BI             | Vê tudo. Aprova o cadastro dos parceiros, define as regras de remuneração, acompanha indicações, envia a planilha, fecha o mês. Usa a IA.        |
| **Parceiro** | Unidade franqueada ou parceiro externo (por exemplo, contador) | Registra indicações e acompanha as próprias: o que já rende, quanto vai receber, os meses fechados.                                              |
| **Vendedor** | Quem vende por uma unidade ou parceiro                         | Registra indicações em nome da unidade e acompanha só as que ele mesmo registrou: a etapa e as vidas pagas do mês. Não vê nenhum valor em reais. |

São esses três perfis. Quem exporta e envia a planilha do BI usa o perfil de diretor, com o
mesmo acesso. Todos os diretores são iguais: qualquer um convida outro diretor em **Equipe** e gera
link de nova senha para ele. Cada pessoa troca a própria senha em **Minha conta**. Cada parceiro vê
só os próprios dados: nenhum parceiro vê outro parceiro nem as indicações dele. O vendedor vê só
as indicações que ele registrou, sem painel, fechamentos nem valores.

## 3. Palavras do sistema

| Termo                         | O que significa                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parceiro**                  | Quem indica clientes: uma **Unidade** ou um **Parceiro externo**. Tem um login.                                                                                                                   |
| **Indicação**                 | Uma empresa (CNPJ) que o parceiro indicou à Fortes Pay.                                                                                                                                           |
| **Vidas pagas**               | Quantidade da coluna "C. Cash-in" da planilha do BI para aquele CNPJ no mês (confirmado em 09/11/2026).                                                                                           |
| **Valor por vida (R$)**       | Quanto o parceiro recebe por vida paga. Ex.: R$ 1,50.                                                                                                                                             |
| **Regra de remuneração**      | Valor por vida + **Vale a partir de** (mês em que começa) + **Prazo (meses)**. Cada parceiro tem a sua.                                                                                           |
| **Vigência**                  | Cada versão da regra (do parceiro ou de uma indicação). Uma vigência nova vale do mês dela em diante; a do parceiro, só para quem for indicado a partir dele. As anteriores ficam como histórico. |
| **Prazo (meses)**             | Por quantos meses cada cliente rende, contados do primeiro mês pago. Em branco = sem prazo.                                                                                                       |
| **Prévia**                    | Valor do mês em andamento, calculado com a última planilha enviada. Pode mudar até o fechamento.                                                                                                  |
| **Valor oficial**             | Valor de um mês fechado. Não muda mais.                                                                                                                                                           |
| **Fechamento (lote)**         | Ato do diretor que encerra um mês: decide quem recebe e quem acumula.                                                                                                                             |
| **Pagar / Acumular**          | Decisão do fechamento para cada parceiro: receber agora ou juntar com o próximo mês.                                                                                                              |
| **Saldo acumulado a receber** | Valor que ficou para o próximo fechamento porque o parceiro não foi marcado para receber.                                                                                                         |
| **Ajuste**                    | Valor a mais ou a menos que o diretor aplica a um parceiro no fechamento, sempre com motivo.                                                                                                      |

## 4. O caminho completo, em uma página

1. O parceiro abre o site e clica em **Solicitar criação de conta** (o diretor pode enviar o
   endereço do cadastro).
2. O parceiro preenche o cadastro e cria a senha. Fica **em análise**.
3. O diretor **aprova** o cadastro e, na mesma tela, escolhe o tipo do parceiro e define a
   **regra de remuneração**.
4. O parceiro registra as **indicações** (CNPJ e nome da empresa). O diretor registra o andamento
   da negociação.
5. Várias vezes por semana, a Fortes Pay envia a **planilha do BI** do mês. Cada
   envio atualiza as vidas pagas, e o parceiro vê a **prévia** do mês.
6. Quando o cliente indicado aparece pagando na planilha, a indicação passa a **render comissão**.
7. Depois que o mês termina e a planilha do mês inteiro é enviada, o diretor **fecha o mês**:
   confere, ajusta se precisar e marca quem recebe. Quem não é marcado **acumula**.
8. O parceiro vê o **valor oficial** em Meus fechamentos e **confirma** ou **contesta**. O diretor
   anota **como foi pago**.

## 5. Parceiros

### Cadastro

- O parceiro cria a própria conta, sem convite: na tela de entrada, **Solicitar criação de conta**. A
  tela **Parceiros** mostra o endereço direto do cadastro, para o diretor enviar como preferir
  (WhatsApp, e-mail).
- O parceiro preenche: nome da unidade ou do parceiro, cidade/UF, responsável, telefone (o campo
  formata sozinho como `(86) 99999-0000`), e-mail de
  acesso, senha e **confirmação da senha** (digitar duas vezes evita erro de digitação; se forem
  diferentes, nada é criado).
- O cadastro fica **Aguardando aprovação** e o parceiro vê a tela "Cadastro em análise". Ele só
  entra no sistema depois que um diretor aprova. A **Visão geral** do diretor avisa quantos
  cadastros estão aguardando, com um atalho para Parceiros.
- Um e-mail faz um cadastro só: tentar de novo com o mesmo e-mail mostra "Este e-mail já tem conta".
- Convites de parceiro não existem mais. Quem abrir um link antigo de convite é levado ao cadastro.

### Aprovação e recusa

- Em **Parceiros → Aguardando aprovação → Analisar e aprovar**, o diretor confere os dados,
  escolhe o **Tipo de parceiro** (Unidade ou Parceiro externo) e preenche a regra: **Valor por
  vida (R$)**, **Vale a partir de** e **Prazo (meses)**. Não existe parceiro ativo sem tipo e sem
  regra.
- **Aprovar e liberar acesso** libera o login na hora.
- **Recusar cadastro** exige um motivo. O parceiro vê "Cadastro não aprovado" e o motivo ao
  entrar. Um cadastro recusado pode ser reconsiderado e aprovado depois.

### Regra de remuneração (vigências)

- A ficha do parceiro mostra a regra de hoje numa frase, por exemplo: "Hoje: R$ 1,80 por vida ·
  sem prazo · vale desde nov/2026".
- Para mudar o valor, o diretor cria uma **Nova vigência** a partir de um mês. Os meses anteriores
  continuam com o valor antigo, e a vigência nova vale **só para quem for indicado a partir daquele
  mês**: indicações anteriores seguem a regra de quando foram feitas (decisão 23). O "valor por
  vida" do parceiro mostrado num mês é a regra para indicações novas; o valor do mês é a soma de
  cada indicação com a regra dela.
- Só a vigência mais recente pode ser editada ou removida, e só enquanto nenhum mês fechado a usa.
  Não dá para criar vigência num mês já fechado.
- O **prazo** serve para quem recebe por tempo limitado (por exemplo, contador com 12 meses): cada
  cliente rende os primeiros N meses depois do primeiro pagamento.
- **Vigência aplicada a uma empresa.** Por padrão, cada indicação segue a vigência do parceiro de
  quando foi feita (ou a do primeiro pagamento, se a empresa já pagava antes). Para um caso
  pontual, por exemplo a empresa nova que pagou no começo de outubro mas deve seguir a vigência de
  setembro, o diretor escolhe outra vigência do parceiro para aquela empresa: no detalhe do envio
  da planilha (seção 7) ou na ficha da indicação. Só dá para trocar quando o parceiro tem mais de
  uma vigência e a indicação ainda não teve vidas num mês fechado; depois disso, usa-se o valor
  próprio da indicação (seção 6).

### Ficha do parceiro

Para o diretor, a ficha reúne: situação e contato, regra de remuneração, indicações do parceiro,
vidas e valores dos últimos 12 meses, **Acesso ao sistema** (link de nova senha) e os dados do
cadastro, que só o diretor edita. O parceiro vê os próprios dados em **Meu cadastro**, só para
leitura.

### Nova senha

Na tela de entrada, **Esqueci minha senha**: a pessoa informa o e-mail do acesso e recebe, pela
caixa de suporte da Fortes Pay, um link para criar a senha nova. O link vale 24 horas e uma única
vez. A tela responde do mesmo jeito com ou sem cadastro naquele e-mail, e aceita um pedido a cada
2 minutos por conta. Vale para parceiro e para diretor.

Se o e-mail não chegar (caixa de spam, endereço errado no cadastro), o diretor gera o mesmo link
na ficha do parceiro → **Acesso ao sistema → Gerar link de nova senha** (para outro diretor, em
**Equipe**) e envia por WhatsApp ou e-mail. Gerar outro link invalida o anterior. Quem lembra a
senha e quer trocá-la usa **Minha conta** (ao lado de Sair): senha atual, nova e confirmação.

## 6. Indicações

### Registro

- O parceiro registra em **Minhas indicações → Nova indicação**: CNPJ do cliente, nome da empresa
  e, se souber, quantas vidas a empresa tem (estimativa). O **vendedor da indicação** é gravado
  sozinho: o e-mail da conta que registra (o da unidade, ou o do vendedor quando é ele quem
  registra).
- O diretor também pode registrar uma indicação em nome de um parceiro, informando o vendedor em
  texto livre, e corrigir o vendedor na ficha da indicação. O vendedor aparece junto da empresa
  nas listas e no fechamento; comissão de vendedor fica para a fase 2.
- **Vale a primeira indicação de cada CNPJ.** Se outro parceiro tentar o mesmo CNPJ, o sistema
  recusa com "CNPJ já indicado em dd/mm/aaaa", sem mostrar quem indicou. Só o diretor vê o nome.
- O CNPJ é conferido (dígitos verificadores) e aceita o formato alfanumérico novo.

### Vendedores

- O vendedor pede a própria conta: na tela de entrada, **Solicitar criação de conta** e depois
  **Solicitar conta de vendedor**. Ele informa o seu nome, o **e-mail da unidade** a que pertence
  (o e-mail com que a unidade entra no sistema), o e-mail de acesso e a senha, e fica com a
  **solicitação em análise**.
- O diretor é avisado na **Visão geral** e aprova ou recusa em **Parceiros → Vendedores pedindo
  acesso**. Na ficha do parceiro, o quadro **Vendedores** lista os vendedores da unidade e permite
  remover o acesso, liberar de novo e gerar o link de nova senha do vendedor.
- O vendedor aprovado tem um menu só, **Minhas indicações**: registra indicações em nome da
  unidade e vê as que ele mesmo registrou, com a etapa, o que está acontecendo e as vidas pagas do
  mês. Ele **não vê valor por vida, valor, prazo nem comissão**, nem as indicações da unidade ou
  de outros vendedores.
- A unidade e o diretor veem, em cada indicação, o e-mail de quem a registrou.

### Situações e etapas

O diretor acompanha sete situações. O parceiro vê as mesmas indicações agrupadas em três etapas,
que respondem à pergunta "isso já rende?".

| Etapa (o parceiro vê) | Situação (o diretor vê)                      | O que significa                                                          | Quem muda                |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| **Ainda não rende**   | Indicada                                     | Registrada; a Fortes Pay ainda vai falar com o cliente.                  | Automático ao registrar  |
|                       | Em negociação                                | A Fortes Pay está negociando com o cliente.                              | Diretor                  |
|                       | Fechada (o parceiro vê "Contrato fechado")   | Contrato assinado, mas o cliente ainda não pagou.                        | Diretor                  |
| **Rendendo comissão** | Ativa (o parceiro vê "Rendendo")             | O cliente paga: cada vida paga no mês vira comissão.                     | Automático pela planilha |
|                       | Inadimplente (o parceiro vê "Sem pagamento") | O cliente não pagou no último mês completo. Volta a render quando pagar. | Automático pela planilha |
| **Encerradas**        | Perdida                                      | A negociação não fechou.                                                 | Diretor                  |
|                       | Cancelada                                    | O cliente encerrou. Os meses já fechados continuam valendo.              | Diretor                  |

Importante: **"Fechada" ainda não rende.** A indicação só começa a render no primeiro mês em que o
cliente aparece pagando na planilha do BI.

Mudanças que o diretor pode fazer (o sistema só oferece as permitidas):

| De            | Para                            |
| ------------- | ------------------------------- |
| Indicada      | Em negociação, Fechada, Perdida |
| Em negociação | Fechada, Perdida                |
| Fechada       | Em negociação, Perdida          |
| Perdida       | Em negociação                   |
| Ativa         | Cancelada                       |
| Inadimplente  | Cancelada                       |
| Cancelada     | nenhuma                         |

Ativa e Inadimplente nunca são escolhidas à mão: mudam sozinhas com a planilha (seção 7).

### Valor e prazo próprios de uma indicação

Na indicação, o diretor pode definir **valor por vida** e **prazo** só para ela (por exemplo, um
cliente estratégico a R$ 3,00 por 6 meses), como **vigências próprias**: cada uma vale a partir de
um mês, só a mais recente pode ser editada ou removida, e mês fechado não muda. Sem vigência
própria (ou com o valor em branco), vale a regra do parceiro de quando a indicação foi feita. O
valor e o prazo informados ao registrar a indicação em nome do parceiro viram a primeira vigência
dela, a partir do mês atual.

## 7. A planilha do BI

### O que enviar

- A planilha **Detalhamento Empresas** exportada do BI, **um mês por vez**, em **.csv** (como o
  Google Planilhas salva) ou **.xlsx** (como o Power BI exporta). Não precisa mexer em nada no
  arquivo.
- Em **Importações**, escolha o **Mês de referência** (o mesmo filtrado no BI) e o arquivo e
  clique em **Conferir arquivo**. A tela mostra, **sem gravar nada**, o que vai mudar: cada
  indicação com as vidas de hoje e as do arquivo, a mudança de situação (por exemplo, Fechada →
  Ativa), o valor do mês antes e depois, os totais por parceiro, as indicações que não aparecem
  no arquivo e as linhas que não entram. Se estiver certo, **Confirmar e importar**; se não,
  **Cancelar**.
- O sistema lê o CNPJ, o nome da empresa, o grupo e a coluna **C. Cash-in** (vidas pagas). As
  outras colunas são ignoradas.

### O que acontece em cada envio

- **Substitui, nunca soma.** Cada envio troca as vidas do mês inteiro pelo que está no arquivo.
  Enviar o mesmo arquivo duas vezes não duplica nada.
- **Só empresas indicadas entram.** O arquivo traz todos os clientes da Fortes Pay; o sistema
  grava só os CNPJs que têm indicação e mostra as demais como "fora da plataforma", sem guardar
  nada delas.
- Linhas com CNPJ inválido ou vidas não numéricas são **ignoradas**, com o motivo no detalhe do
  envio. CNPJ repetido no arquivo é somado e aparece como "mesclada".
- A indicação que aparece com vidas passa a **Ativa** (e fica registrado o primeiro mês pago).
- Depois de importar, o detalhe do envio mostra **Empresas com vidas no mês**: cada empresa
  indicada, o parceiro, a vigência aplicada e o valor do mês, com as empresas novas (primeiro mês
  pago) no topo. É ali que o diretor troca a vigência do parceiro de uma empresa, quando o caso
  pede (seção 5, "Vigência aplicada a uma empresa").

### Envio parcial e mês completo

- O mês em andamento pode ser enviado **várias vezes por semana**. Esse envio é **parcial**: atualiza
  a prévia, ativa quem pagou, mas **não marca ninguém como inadimplente**, porque o cliente ainda
  pode pagar até o fim do mês.
- O envio feito **depois que o mês termina** é o do **mês completo**. Ele libera o fechamento e
  marca como **Inadimplente** a indicação ativa que não teve vidas no mês.
- O histórico de envios mostra data, hora, quem enviou e se foi parcial ou mês completo.

### Quando o envio é recusado

- O rodapé "Filtros aplicados" da planilha é de outro mês, ou de mais de um mês.
- O mês escolhido é futuro.
- O arquivo não tem as colunas do BI, passa de 4 MB ou não é .csv nem .xlsx.
- O mês escolhido já está fechado: "Mês já fechado (mm/aaaa): a planilha não entra". Para
  corrigir um mês fechado, reabra o lote em Fechamento do mês (seção 9).

## 8. Como o valor é calculado

**Valor do mês de uma indicação = vidas pagas no mês × valor por vida.**

O valor por vida é o próprio da indicação, quando definido; senão, o da regra do parceiro vigente
naquele mês. O valor do parceiro no mês é a soma das indicações dele.

Exemplo, com a regra do parceiro em R$ 1,50 por vida:

| Indicação | Vidas pagas no mês | Valor por vida    | Valor do mês |
| --------- | ------------------ | ----------------- | ------------ |
| Empresa A | 30                 | R$ 1,50 (regra)   | R$ 45,00     |
| Empresa B | 20                 | R$ 1,50 (regra)   | R$ 30,00     |
| Empresa D | 4                  | R$ 3,00 (próprio) | R$ 12,00     |
| **Total** | **54**             |                   | **R$ 87,00** |

O que **não** conta no mês:

- indicação que ainda não rende (Indicada, Em negociação, Fechada);
- indicação Inadimplente no mês (aparece com 0 vidas, para o parceiro poder cobrar o cliente);
- indicação Perdida ou Cancelada;
- mês fora do prazo da indicação (o prazo conta do primeiro mês pago).

## 9. Fechamento do mês

### Quando um mês pode ser fechado

O mês só fecha depois que termina, quando a planilha do mês completo já foi enviada e quando os
meses anteriores já foram fechados (os meses fecham **em ordem**). A tela **Fechamento do mês**
mostra três etapas e diz o que falta em cada uma:

1. **Conferir a planilha do mês**: existe envio feito depois do fim do mês?
2. **Preparar e revisar o cálculo**: o botão **Preparar cálculo** monta a tabela por parceiro.
3. **Fechar o lote**.

### Preparar e revisar

A tabela mostra, por parceiro: vendedor(es) do mês, vidas, valor do mês, ajuste, **saldo
anterior** (o que vinha acumulado) e total. Sob cada parceiro, **Ver clientes (n)** abre os
clientes daquele mês, cada um com vendedor, vidas, valor por vida e valor, e a linha **Total dos
clientes**; a soma dos clientes é o valor do parceiro. Esse detalhe é gravado no momento do cálculo e fica igual depois de fechado,
mesmo que a indicação mude de valor ou de situação. Antes de fechar, o diretor pode:

- **Ajustar o valor de um parceiro** (a mais ou a menos), sempre com motivo. O parceiro vê o ajuste
  e o motivo.
- **Recalcular**, se chegou planilha nova (o ajuste é mantido).
- Pedir a **Revisão da IA** (seção 11).

### Fechar o lote

- Na tabela, ao lado do nome de cada parceiro, um checkbox diz **quem recebe** neste mês. Todos
  com valor a receber já vêm marcados; o checkbox do cabeçalho marca ou desmarca todos. O diretor
  desmarca quem deve acumular e confirma que conferiu a base e o cálculo.
- Quem ficou marcado fica como **Pagar**. Quem foi desmarcado fica como **Acumular**: o total entra
  como saldo anterior no próximo fechamento, e assim por diante, sem limite de meses.
- Depois de fechado, **nada mais entra naquele mês**: a planilha do mês é recusada, e vigência ou
  ajuste não mudam o valor oficial.
- Para cada parceiro pago, o diretor anota **Como foi pago** (por exemplo, "PIX em 05/11"). O
  parceiro vê essa anotação.

Exemplo de acúmulo: o contador tem R$ 15,00 em setembro e não é marcado (acumula). Em outubro tem
R$ 18,00; o fechamento de outubro mostra saldo anterior R$ 15,00 e total R$ 33,00.

### Reabrir um mês fechado

Para corrigir um erro depois do fechamento, o diretor usa **Reabrir o lote**, no fim da tela do mês
fechado. Só o **último mês fechado** pode ser reaberto; havendo um mês posterior fechado, reabre-se
ele antes. Ao reabrir:

- o mês volta para **Em preparação**, com os mesmos valores e ajustes;
- a decisão de pagar ou acumular, a resposta dos parceiros e o "como foi pago" são **apagados**;
- o mês sai de Meus fechamentos dos parceiros (volta a ser prévia) até ser fechado de novo;
- a planilha do mês volta a ser aceita.

Depois de corrigir (nova planilha, ajuste), o diretor **recalcula** e **fecha o lote** outra vez, e
os parceiros respondem de novo.

### Resposta do parceiro

Em **Meus fechamentos**, o parceiro vê cada mês fechado (vidas, valor, ajuste, saldo anterior,
total, decisão) e responde **Confirmar valor** ou **Contestar**, explicando o que não confere. O
diretor vê a resposta na coluna "Resposta do parceiro".

### Histórico

Cada fechamento guarda, por parceiro: valor do mês, ajuste e motivo, saldo anterior, total,
decisão, data e quem decidiu, resposta do parceiro e como foi pago. A seção **Fechamentos
registrados** lista os meses com quem preparou e quem fechou.

## 10. O que cada perfil vê

### Diretor

| Menu                  | O que tem                                                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visão geral**       | Valor do mês, vidas pagas, saldo acumulado a pagar e parceiros com vidas; tabela por parceiro; indicações por etapa. Avisa quando o mês escolhido já está fechado.                                                                      |
| **Parceiros**         | Aguardando aprovação (com o endereço do cadastro para enviar ao parceiro), Vendedores pedindo acesso, Ativos (com a regra de hoje) e Recusados. Cada parceiro abre a ficha (seção 5), que também lista os vendedores dele.              |
| **Indicações**        | Todas as indicações, com filtros por parceiro e situação, busca por CNPJ ou empresa e o mês das vidas; situação, parceiro, valor e prazo; mudar situação; registrar em nome de um parceiro. É o relatório de quem indicou cada cliente. |
| **Importações**       | Enviar a planilha; histórico de envios; detalhe de cada envio com as empresas do mês (e a vigência aplicada a cada uma), as linhas ignoradas e a análise da IA.                                                                         |
| **Fechamento do mês** | As três etapas, a tabela do mês (com quem recebe marcado ao lado do nome), ajustes, fechar o lote, como foi pago, reabrir o lote, revisão da IA e fechamentos registrados.                                                              |
| **Equipe**            | Os diretores, com e-mail de acesso. **Convidar diretor** gera um link de uso único: quem abre cria o próprio acesso e entra direto. **Gerar link de nova senha** para outro diretor (24 horas, uso único).                              |

O seletor de **Mês** (Visão geral, Indicações, Fechamento do mês e Meu painel) troca o mês assim que
é escolhido, sem botão.

### Parceiro

| Menu                  | O que tem                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Meu painel**        | "Como funciona" em três passos; o mês escolhido como **prévia** (vidas pagas até o dia anterior, valor previsto com o saldo acumulado e o saldo total, data do último envio da planilha **daquele mês**) ou como **valor oficial**, se já fechado (também com a data da base do BI); **Últimos envios da planilha** (data/hora, mês, parcial ou mês completo); o aviso para responder o último fechamento; as indicações que rendem no mês, com o total de vidas e de valor. |
| **Minhas indicações** | Resumo em números (quantas indicações viraram cliente, quantas estão em andamento, quantas foram perdidas), Nova indicação e as indicações nas três etapas, cada uma com uma frase do que está acontecendo e do que falta.                                                                                                                                                                                                                                                   |
| **Meus fechamentos**  | Cada mês fechado com o valor oficial, a decisão, como foi pago e os botões Confirmar valor e Contestar.                                                                                                                                                                                                                                                                                                                                                                      |
| **Meu cadastro**      | Dados do cadastro e a regra de remuneração (só leitura).                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Vendedor

Só **Minhas indicações**: resumo em números, Nova indicação e as indicações que ele registrou, em
três grupos (Clientes pagando, Em andamento, Encerradas), com as vidas pagas do mês e sem nenhum
valor.

Nos três perfis, **Minha conta** (ao lado de Sair) mostra nome, e-mail de acesso e perfil, e é onde
a pessoa troca a própria senha: senha atual, nova e confirmação. Quem esqueceu a senha pede o link a
um diretor.

### Ajuda nas telas (o "i")

Nos três perfis, ao lado do título de cada seção, de cada número de resumo e das colunas que são
conceito (Vidas, Valor por vida, Ajuste, Saldo anterior, Total, Decisão, Situação…) há um **i** num
círculo. Passar o mouse, tocar ou apertar Enter abre um balão com a explicação: o que aquilo é, como
é calculado ou quando usar, e o que acontece depois. Esc, ou um toque fora, fecha. Os textos do
vendedor não falam de valores. Campos e botões não têm o "i": a ajuda deles continua embaixo do
campo ou aparece ao abrir o formulário.

## 11. IA do diretor

Só o diretor vê e usa. A IA (Claude, da Anthropic) **aponta e explica**; não calcula, não decide
pagar ou acumular e não altera dados.

- **Análise do envio**: roda sozinha quando o diretor envia a planilha (e pode ser pedida de novo).
  Compara com o envio anterior do mês e com o mês passado, aponta quedas, saltos e indicações que
  sumiram, e procura empresas do arquivo que podem ser uma indicação com o **CNPJ digitado errado**.
- **Revisão do fechamento**: botão **Analisar com IA** no mês preparado, antes de fechar. Confere
  cada parceiro contra o mês anterior e aponta valores que mudaram muito, indicação ativa sem
  vidas, saldo acumulado há meses, ajuste sem motivo e prazos terminando.
- Em geral responde em menos de um minuto; a página se atualiza sozinha.
- Vão para a IA nomes de parceiros e empresas, CNPJs, situações, vidas e valores. Nunca e-mail,
  telefone ou dados de pagamento. A Fortes Pay autorizou o envio em 29/10/2026 (a API não usa os
  dados para treino).

## 12. Segurança e privacidade

- Cada pessoa entra com o próprio e-mail e senha. Cada perfil só abre as próprias telas; digitar o
  endereço de outra tela leva de volta ao início do perfil.
- O banco confere o perfil em toda leitura e gravação: mesmo chamando o banco por fora da tela, um
  parceiro não lê dados de outro.
- Senhas e links (convite de diretor, nova senha) não ficam guardados em texto: só uma impressão
  (hash).
- O cadastro de parceiro é aberto, mas ninguém entra sem a aprovação de um diretor.
- O "Esqueci minha senha" não revela se um e-mail tem cadastro.
- Sessão que expira com a tela aberta leva ao login com o aviso "Sua sessão expirou".

## 13. Limitações conhecidas

- **E-mail**: o único e-mail que o sistema envia é o do "Esqueci minha senha", pela caixa de
  suporte. Ele depende de a caixa estar configurada no servidor; enquanto não estiver, a tela
  explica o caminho pelo diretor. O sistema não avisa por e-mail quando chega um cadastro novo,
  quando ele é aprovado ou quando o mês fecha.
- **E-mail do cadastro não é conferido**: o parceiro que digitar o e-mail errado ao criar a conta
  não recebe o link de nova senha; o diretor corrige gerando o link pela ficha.
- **Endereço**: o sistema está em https://fpay-indicacao.vercel.app até o domínio da Fortes Pay ser
  configurado.
- **Um login por parceiro**, mais os vendedores que o diretor aprovar. A unidade não administra os
  próprios vendedores (é o diretor quem aprova e remove) e não há comissão de vendedor.
- Uma conta tem um perfil só: o e-mail da unidade não pode ser também de um vendedor.
- Um CNPJ indicado fica com aquele parceiro, mesmo que a indicação seja perdida ou cancelada.
- O parceiro não edita o próprio cadastro nem muda a resposta depois de confirmar ou contestar.
- Não há exportação do fechamento em CSV ou PDF.
- O seletor de mês do Firefox e do Safari é uma caixa de texto: digite no formato AAAA-MM.

## 14. Pontos que a Fortes Pay precisa confirmar

Já confirmado em 09/11/2026: **"C. Cash-in" é a medida de vidas pagas do mês.**

1. **Cada planilha parcial traz o acumulado do mês até o dia**, e não só as vidas novas desde o
   envio anterior. O sistema substitui o mês a cada envio; se a planilha trouxer só as novas, os
   valores ficariam menores.

## 15. Próximos passos possíveis

Anotados durante o projeto e fora desta fase: comissão de vendedor (fase 2); vários
logins por parceiro; inativar parceiro; reindicar CNPJ perdido; e-mail automático de cadastro novo,
aprovação e fechamento; exportar o fechamento; carga do histórico da planilha antiga; automação da leitura do
BI (somente leitura); alerta de "cliente já pagava antes da indicação".

## 16. Onde encontrar mais

- Roteiro de testes da área de negócio: `docs/roteiro-validacao.md` e a planilha
  [`roteiro-de-testes.xlsx`](roteiro-de-testes.xlsx), para marcar o resultado de cada passo.
- Regras e decisões, com data: `docs/requisitos.md` (levantamento original) e `docs/decisoes.md`
  (decisões posteriores, que valem sobre o levantamento).
- Formato da planilha do BI: `docs/arquivo-bi.md`.
- Documentação técnica: [`documentacao-tecnica.md`](documentacao-tecnica.md).
