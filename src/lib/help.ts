// Textos do "i" de ajuda (decisão 33): o que cada seção, número ou coluna é, como é calculado ou
// quando usar, e o que acontece depois. Um lugar só, para a área revisar e corrigir.
// Agrupados por quem lê. "todos" e "vendedor" aparecem para o vendedor, que não vê nenhum valor
// (decisão 29): o teste help.test.ts recusa qualquer menção a dinheiro nesses dois grupos.

// Termos que se repetem nas telas do diretor.
const tipoDeParceiro =
  "Unidade: unidade da própria rede. Parceiro externo: quem indica de fora, como um contador. O tipo é escolhido na aprovação do cadastro.";

const situacaoDaIndicacao =
  "Indicada, Em negociação e Fechada ainda não rendem. Ativa: o cliente paga e a indicação rende. Inadimplente: ativa sem vidas no mês completo. Perdida e Cancelada: encerradas. Ativa e Inadimplente mudam sozinhas a cada planilha do BI; as outras, o diretor muda.";

const rendeDesde =
  "Primeiro mês em que a empresa teve vidas pagas contando para esta indicação. O prazo, quando existe, é contado a partir dele.";

const vidasEstimadas =
  "Quantos funcionários a empresa tem, informado por quem registrou a indicação. É só referência: não entra em nenhum cálculo.";

const vidasPagasDoBi =
  "Vidas (funcionários) pagas no mês, lidas da coluna C. Cash-in da planilha do BI.";

const vigenciaEditavel =
  "Só a vigência mais recente pode ser editada ou removida, e só enquanto nenhum mês fechado a usou. As outras ficam como histórico.";

export const help = {
  todos: {
    indicacoes: {
      resumo:
        "Suas indicações em três grupos. Viraram cliente: contrato fechado ou cliente que já pagou, inclusive o que cancelou depois. Em andamento: indicada ou em negociação. Perdidas: a negociação não fechou.",
    },
    conta: {
      alterarSenha:
        "Troca a sua senha de acesso. Informe a senha atual e a nova, duas vezes; você continua conectado. Quem esqueceu a senha atual pede um link de nova senha: o diretor, a outro diretor em Equipe; parceiro e vendedor, à Fortes Pay.",
    },
  },

  vendedor: {
    indicacoes: {
      pagando:
        "Empresas que você indicou e que já pagam a Fortes Pay. A coluna de vidas mostra quantas foram pagas no mês mais recente enviado pela Fortes Pay. Se o cliente deixar de pagar num mês completo, ele continua aqui como “Sem pagamento”.",
      andamento:
        "Indicações que ainda não viraram cliente pagante: Indicada (a Fortes Pay ainda vai falar com a empresa), Em negociação e Contrato fechado (falta o primeiro pagamento). Quando a empresa começar a pagar, ela sobe para Clientes pagando.",
      encerradas:
        "Indicações que terminaram: Perdida (a negociação não fechou) ou Cancelada (a empresa era cliente e encerrou). Ficam aqui só como histórico.",
      situacao:
        "Em que ponto está a indicação: Indicada, Em negociação, Contrato fechado, Cliente pagando, Sem pagamento, Perdida ou Cancelada. Quem muda a situação é a Fortes Pay; Cliente pagando e Sem pagamento mudam sozinhas a cada planilha enviada.",
      acontecendo:
        "Uma frase com o momento da indicação e o que falta para o próximo passo. Muda junto com a situação.",
      vidas:
        "Quantas vidas (funcionários) dessa empresa foram pagas à Fortes Pay no mês indicado, segundo a última planilha enviada. No mês em andamento o número ainda pode subir.",
    },
  },

  parceiro: {
    painel: {
      previa:
        "Prévia do mês: mostra o que as suas indicações renderam até a última planilha enviada pela Fortes Pay. Não é o valor final: ele só fica oficial quando a Fortes Pay fecha o mês, e então aparece em Meus fechamentos.",
      oficial:
        "Este mês já foi fechado pela Fortes Pay: valem os números do fechamento, com o que rendeu no mês, o ajuste, o saldo que vinha de antes e a decisão de pagar ou acumular. Confira e responda em Meus fechamentos.",
      vidasPagas:
        "Total de vidas (funcionários) dos seus clientes que pagaram a Fortes Pay neste mês, segundo a última planilha. No mês em andamento é uma contagem parcial, que sobe a cada planilha enviada.",
      valorPrevisto:
        "Prévia do que você deve receber neste mês: vidas pagas × valor por vida de cada indicação. Pode mudar até a Fortes Pay fechar o mês. Abaixo, o saldo acumulado é o que ficou do último mês fechado sem ser pago, e o saldo total soma os dois.",
      valorDoMes:
        "O que as suas indicações renderam neste mês: vidas pagas × valor por vida de cada indicação. Abaixo aparecem o ajuste feito pela Fortes Pay, se houve, e o saldo que vinha do mês anterior.",
      totalDoFechamento:
        "Valor do mês + ajuste + saldo que vinha de antes. A Fortes Pay decide pagar este total agora ou acumular para o próximo fechamento; a decisão e a sua resposta aparecem aqui.",
      envios:
        "Cada vez que a Fortes Pay envia a planilha de pagamentos, as vidas do mês são substituídas pelas da planilha nova. Envio parcial: o mês ainda está em andamento. Mês completo: feito depois que o mês terminou; é o que vale para o fechamento.",
      mesDaPlanilha:
        "A qual mês a planilha se refere e se o envio foi parcial (mês em andamento) ou do mês completo (depois do último dia).",
      minhasIndicacoes:
        "Seus clientes neste mês. Os três números contam todas as suas indicações por etapa; a tabela lista quem rende no mês escolhido e também quem já rendia e ficou sem pagamento (aparece com 0). A lista completa fica em Minhas indicações, no menu.",
      situacao:
        "Rendendo: o cliente pagou e a indicação gera comissão. Sem pagamento: o cliente não pagou no último mês completo; volta a render quando pagar.",
      vidasNoMes:
        "Quantas vidas (funcionários) desse cliente foram pagas à Fortes Pay no mês escolhido.",
      valorPorVida:
        "Quanto você recebe por vida paga desse cliente. É o da sua regra de quando a indicação foi feita, ou um valor próprio combinado com a Fortes Pay para essa indicação.",
      valorNoMes: "Vidas no mês × valor por vida deste cliente.",
      prazo:
        "Por quantos meses esse cliente rende comissão, contados do primeiro mês em que ele pagou. “Sem prazo” rende enquanto o cliente pagar.",
    },
    indicacoes: {
      rendendo:
        "Clientes que já pagam a Fortes Pay: cada vida paga no mês vira comissão. Quem deixou de pagar no último mês completo continua aqui como “Sem pagamento” e volta a render quando pagar.",
      aindaNaoRende:
        "Indicações que ainda não geram comissão: Indicada (a Fortes Pay ainda vai falar com a empresa), Em negociação e Contrato fechado (falta o primeiro pagamento). Começam a render no primeiro mês em que o cliente pagar.",
      encerradas:
        "Indicações que não rendem mais: Perdida (a negociação não fechou) ou Cancelada (o cliente encerrou). Os meses em que renderam continuam valendo.",
      situacao:
        "Em que ponto está a indicação: Indicada, Em negociação, Contrato fechado, Rendendo, Sem pagamento, Perdida ou Cancelada. Quem muda é a Fortes Pay; Rendendo e Sem pagamento mudam sozinhas a cada planilha enviada.",
      acontecendo:
        "Uma frase com o momento da indicação: o que falta para começar a render ou, se já rende, desde quando, quanto por vida e por quanto tempo.",
      vidas:
        "Vidas (funcionários) desse cliente pagas à Fortes Pay no mês indicado, segundo a última planilha. No mês em andamento o número ainda pode subir.",
    },
    fechamentos: {
      mes: "O fechamento oficial deste mês, feito pela Fortes Pay: a conta completa até o total e a decisão de pagar ou acumular. Confira e responda no fim do cartão. Se a Fortes Pay reabrir o mês para corrigir algo, ele some daqui até ser fechado de novo, e a resposta é pedida outra vez.",
      vidas:
        "Vidas (funcionários) dos seus clientes que pagaram a Fortes Pay no mês, pela planilha do mês completo.",
      valorDoMes:
        "O que as suas indicações renderam no mês: para cada cliente, vidas pagas × valor por vida da indicação.",
      ajuste:
        "Acréscimo ou desconto (com sinal de menos) que a Fortes Pay aplicou neste mês, com o motivo ao lado. Só aparece quando houve ajuste.",
      saldoAnterior:
        "Total do fechamento anterior que não foi pago e ficou acumulado. Entra somado neste mês. É R$ 0,00 quando o mês anterior foi pago.",
      total:
        "Valor do mês + ajuste + saldo que vinha de antes. É sobre este total que a Fortes Pay decide pagar ou acumular.",
      decisao:
        "Pagar: a Fortes Pay paga o total deste mês. Acumulado para o próximo mês: o total não é pago agora e entra como saldo no fechamento seguinte. Sem valor a pagar: o total foi zero.",
      comoFoiPago:
        "Anotação da Fortes Pay sobre o pagamento deste mês (por exemplo, PIX e a data). Aparece quando a decisão foi pagar.",
      confere:
        "Sua resposta ao fechamento. Confirmar valor: você concorda com o total. Contestar: escreva o que não confere; a Fortes Pay vê a sua resposta no fechamento do mês. A resposta não pode ser mudada depois.",
    },
    cadastro: {
      regra:
        "Quanto você recebe por vida paga e por quanto tempo, definido pela Fortes Pay. Cada linha da tabela é uma vigência: vale para as indicações feitas a partir daquele mês. Indicações anteriores continuam com a regra de quando foram feitas.",
      valeAPartirDe: "Mês em que a regra começa a valer, para as indicações feitas a partir dele.",
      valorPorVida:
        "Quanto você recebe por cada vida (funcionário) paga no mês pelos clientes indicados nessa vigência.",
      prazo:
        "Por quantos meses cada cliente rende comissão, contados do primeiro pagamento dele. “Sem prazo” rende enquanto o cliente pagar.",
    },
  },

  diretor: {
    visaoGeral: {
      valorDoMes:
        "Quanto todos os parceiros renderam no mês escolhido: para cada indicação ativa, vidas pagas × valor por vida dela. Em mês em andamento é prévia; o valor oficial é o do Fechamento do mês.",
      vidasPagas:
        "Total de vidas (funcionários) de empresas indicadas que pagaram a Fortes Pay no mês, lido da coluna C. Cash-in da planilha do BI. Empresas sem indicação na plataforma não entram.",
      saldoAcumulado:
        "Soma dos totais de quem não foi marcado para receber no último mês fechado. Ainda é devido aos parceiros: entra como saldo anterior de cada um no próximo fechamento.",
      parceirosComVidas:
        "Quantos parceiros ativos tiveram ao menos uma vida paga no mês escolhido, sobre o total de parceiros ativos. Abaixo, quando e por quem foi enviada a última planilha do BI.",
      parceiros:
        "Resultado do mês escolhido, parceiro por parceiro. Entram só as indicações Ativas, respeitando o prazo de cada uma. Clique no nome para abrir a ficha, com a regra, as indicações e os meses.",
      tipo: tipoDeParceiro,
      colunaVidas:
        "Vidas (funcionários) das empresas indicadas por este parceiro que pagaram no mês.",
      colunaValorPorVida:
        "Regra do parceiro para indicações novas neste mês. Cada indicação entra no valor do mês com a regra dela: a de quando foi feita ou a própria. “Sem regra” = há vidas, mas nenhuma vigência cadastrada.",
      colunaValorDoMes:
        "Soma das indicações do parceiro no mês: vidas pagas × valor por vida de cada uma.",
      colunaSaldo:
        "O que ficou acumulado para este parceiro no último mês fechado, por não ter sido marcado para receber. Entra como saldo anterior no próximo fechamento.",
      etapas:
        "Todas as indicações, por situação. Rendendo comissão: Ativa e Inadimplente. Ainda não rende: Indicada, Em negociação e Fechada. Encerradas: Perdida e Cancelada. Só a Ativa gera valor. Clique numa situação para abrir a lista.",
    },
    parceiros: {
      aguardando:
        "Cadastros que o próprio parceiro enviou pela tela de entrada. Abra um cadastro para aprovar, escolhendo o tipo e quanto ele recebe por vida, ou para recusar com um motivo. Enquanto não é aprovado, o parceiro não entra no sistema.",
      vendedoresPedindo:
        "Pedidos de conta de vendedor, feitos com o e-mail da unidade. Aprovado, o vendedor registra indicações em nome da unidade e vê só as dele, sem nenhum valor. Recusado, continua sem acesso. Confirme com a unidade antes de aprovar.",
      acessoDoVendedor:
        "Aprovar vendedor libera a entrada no sistema; Recusar pedido mantém sem acesso. Depois, na ficha do parceiro, dá para remover o acesso ou liberar de novo.",
      ativos:
        "Parceiros aprovados, com acesso ao portal. Clique no nome para abrir a ficha: regra de remuneração, indicações, vidas por mês, vendedores e dados do cadastro.",
      tipo: tipoDeParceiro,
      regraHoje:
        "A regra de remuneração em vigor neste mês: valor por vida e prazo. Vale para as indicações feitas a partir da vigência. “Sem regra” = nenhuma vigência cadastrada.",
      recusados:
        "Cadastros recusados: continuam sem acesso e veem o motivo ao tentar entrar. Abra o cadastro para reconsiderar e aprovar.",
    },
    parceiro: {
      aprovar:
        "Libera o acesso do parceiro ao portal. Escolha o tipo (Unidade ou Parceiro externo), o valor por vida, o mês em que a regra começa e, se houver, o prazo. Tudo isso pode ser ajustado depois com uma nova vigência.",
      recusar:
        "Mantém o parceiro sem acesso. O motivo que você escrever aparece para ele ao tentar entrar. Um cadastro recusado pode ser reconsiderado e aprovado depois.",
      regra: {
        card: "Quanto este parceiro recebe por vida paga. Cada linha é uma vigência: vale para as indicações feitas a partir daquele mês; as anteriores seguem a regra de quando foram feitas. Para mudar o valor daqui para a frente, crie uma nova vigência.",
        validFrom:
          "Mês em que a vigência começa a valer, para quem for indicado a partir dele. Meses já fechados não mudam.",
        valuePerLife:
          "Quanto o parceiro recebe por vida paga no mês, para as indicações desta vigência.",
        term: "Por quantos meses cada cliente rende, contados do primeiro pagamento dele. “Sem prazo” rende enquanto o cliente pagar.",
        editable: vigenciaEditavel,
      },
      indicacoes:
        "Todas as empresas indicadas por este parceiro, em qualquer situação. Só a Ativa rende comissão. Abra uma indicação para mudar a situação ou dar a ela valor e prazo próprios.",
      situacao: situacaoDaIndicacao,
      rendeDesde,
      valorEPrazoHoje:
        "Valor por vida e prazo que valem hoje para esta indicação: os próprios dela, quando combinados, ou a regra do parceiro.",
      vidasEstimadas,
      vidasEValores:
        "Últimos 12 meses com vidas deste parceiro nas planilhas do BI. O valor soma cada indicação com o valor por vida dela. Para meses fechados, o valor oficial é o do Fechamento do mês.",
      vidasPagas: vidasPagasDoBi,
      valorPorVidaDaRegra:
        "A regra do parceiro naquele mês. Indicações com valor próprio, ou feitas numa vigência anterior, podem usar outro valor; por isso vidas × regra pode não bater com a coluna Valor.",
      valor: "Soma do mês: para cada indicação, vidas pagas × valor por vida dela.",
      acesso:
        "O login do parceiro é o e-mail do cadastro. Se ele esquecer a senha e o e-mail de recuperação não chegar, gere aqui um link de nova senha e envie a ele. O link vale 24 horas e uma única vez.",
      vendedores:
        "Contas de vendedor ligadas a este parceiro. O vendedor registra indicações em nome do parceiro e vê só as que ele mesmo registrou, com as vidas e sem nenhum valor. Aqui você aprova, remove ou libera o acesso e gera link de nova senha.",
      situacaoDoVendedor:
        "Aguardando aprovação: pediu a conta e ainda não entra. Com acesso: aprovado. Sem acesso: pedido recusado ou acesso removido.",
      acessoDoVendedor:
        "Aprovar ou recusar o pedido, remover o acesso de quem já entrava e liberar de novo quem estava sem acesso. Vale na hora.",
      novaSenha:
        "Gera um link para o vendedor criar uma senha nova. Copie e envie a ele: vale 24 horas e uma única vez; gerar outro invalida o anterior.",
      dados:
        "Nome, tipo, local e contato do parceiro, como ele preencheu ao se cadastrar. Só o diretor altera; o parceiro vê os dados em Meu cadastro.",
    },
    indicacoes: {
      etapas:
        "Quantas indicações há em cada situação, agrupadas em três etapas. Só a Ativa rende comissão. Clique numa situação para filtrar a lista abaixo.",
      lista:
        "Todas as indicações de todos os parceiros, das mais novas às mais antigas. Use os filtros de parceiro e situação e a busca por CNPJ ou nome. Clique na empresa para abrir a ficha da indicação.",
      situacao: situacaoDaIndicacao,
      rendeDesde,
      valorEPrazoNoMes:
        "Valor por vida e prazo que valem para a indicação no mês escolhido no topo: os próprios dela, quando combinados, ou a regra do parceiro.",
      vidasNoMes:
        "Vidas (funcionários) pagas pela empresa no mês escolhido no topo, pela última planilha do BI. Traço = sem vidas nesse mês.",
      mudarSituacao:
        "Registra o andamento da negociação (Em negociação, Fechada, Perdida) ou o cancelamento de um cliente. Ativa e Inadimplente não são escolhidas: mudam sozinhas a cada planilha do BI. Indicação cancelada não muda mais.",
    },
    indicacao: {
      primeiroMesPago: rendeDesde,
      prazo:
        "Por quantos meses esta indicação rende, a partir do 1º mês pago, e até quando. Vem da vigência própria da indicação ou, em branco, da regra do parceiro.",
      vidasEstimadas,
      vigenciaAplicada:
        "Qual vigência do parceiro vale para esta indicação. O sistema escolhe sozinho: a do mês em que a indicação foi feita, ou a do primeiro pagamento, se a empresa já pagava antes. Você pode escolher outra, enquanto a indicação não teve vidas num mês fechado.",
      regra: {
        card: "Valor e prazo combinados só para esta indicação. Em branco, vale o do parceiro. Cada linha é uma vigência própria, que vale do mês dela em diante; meses já fechados não mudam.",
        validFrom: "Mês a partir do qual esta indicação usa este valor e prazo.",
        valuePerLife:
          "Valor por vida só desta indicação. “Valor do parceiro” = em branco: segue a regra do parceiro.",
        term: "Prazo próprio desta indicação, em meses, contado do 1º mês pago. Quando não é preenchido, vale o prazo da regra do parceiro.",
        editable: vigenciaEditavel,
      },
      vendedor:
        "Quem fez esta indicação. Quando o parceiro ou o vendedor registra pelo portal, o sistema grava o e-mail da conta. Aqui você corrige: texto livre; em branco apaga. Aparece nas listas e no fechamento.",
      mudarSituacao:
        "Registra o andamento da negociação, a perda ou o cancelamento. Ativa e Inadimplente não são escolhidas aqui: mudam sozinhas a cada envio da planilha do BI. Indicação cancelada não muda mais.",
      vidasEValores:
        "Mês a mês, as vidas desta indicação que contaram para a comissão e o valor que geraram. Meses fora do prazo, ou em que a indicação não estava ativa, não aparecem.",
      vidasPagas: vidasPagasDoBi,
      valorPorVida:
        "Valor por vida usado naquele mês para esta indicação: o próprio dela ou o da vigência do parceiro aplicada.",
      valor: "Vidas pagas × valor por vida do mês.",
    },
    importacoes: {
      enviar:
        "Envia a planilha Detalhamento Empresas do BI, filtrada em um mês. Conferir arquivo mostra o que vai mudar sem gravar nada; só Confirmar e importar grava. Cada envio substitui as vidas do mês. Planilha de mês já fechado é recusada.",
      envios:
        "Histórico de todos os envios, do mais novo ao mais antigo, com quem enviou, o mês e as contagens de linhas. Clique num envio para ver a análise da IA, as empresas do mês e as linhas que não entraram.",
      mes: "Mês da planilha. Parcial: enviado com o mês em andamento; só atualiza a prévia. Mês completo: enviado depois do último dia; libera o fechamento e marca como Inadimplente a indicação ativa sem vidas.",
      linhasLidas: "Linhas de empresa lidas do arquivo, antes de qualquer filtro.",
      importadas:
        "Linhas de empresas que são indicações cadastradas na plataforma. São as únicas que entram no cálculo.",
      foraDaPlataforma:
        "Empresas do arquivo que não foram indicadas por nenhum parceiro. São só contadas: não geram valor.",
      ignoradas:
        "Linhas que não puderam ser lidas, como CNPJ inválido. O motivo de cada uma aparece na lista de linhas, mais abaixo.",
      situacao:
        "Situação da indicação. Quando o envio muda a situação, aparecem a de hoje e a nova: por exemplo, a indicação passa a Ativa no primeiro pagamento, ou de Ativa a Inadimplente num envio de mês completo sem vidas.",
      vidasHoje: "Vidas gravadas hoje no sistema para este mês, do envio anterior.",
      noArquivo:
        "Vidas deste mês no arquivo que você está conferindo, com a diferença para as de hoje. É o que fica gravado se você confirmar.",
      valorPorVida:
        "Valor por vida que vale para esta indicação no mês: o próprio dela ou o da regra do parceiro.",
      valorDoMes:
        "Vidas do arquivo × valor por vida, com a diferença para o valor de hoje. “Não conta no mês” = há vidas, mas a indicação está perdida, cancelada ou fora do prazo.",
      vidasComOEnvio:
        "Vidas do parceiro no mês se este arquivo for confirmado, com a diferença para hoje.",
      valorHoje: "Valor do mês do parceiro com as vidas gravadas hoje.",
      valorComOEnvio:
        "Valor do mês do parceiro se este arquivo for confirmado, com a diferença para hoje.",
      resultado:
        "Ignorada: a linha não entrou, pelo motivo ao lado. Mesclada: linha repetida do mesmo CNPJ; as vidas foram somadas, ou a linha idêntica foi contada uma vez só.",
      analiseDaIa:
        "A IA compara este envio com o anterior do mesmo mês e com o mês passado e aponta quedas, saltos e indicações que sumiram. Também procura empresas que podem ser uma indicação com o CNPJ digitado errado. É só um alerta: ela não altera nenhum dado.",
      empresasDoMes:
        "As empresas indicadas que tiveram vidas neste mês e a regra usada para cada uma. Serve para conferir as empresas novas: se uma delas deve seguir outra vigência do parceiro, escolha em Vigência aplicada e clique em Aplicar.",
      primeiroPagamento:
        "Mês do primeiro pagamento da empresa informado pelo BI. Pode ser anterior à indicação, quando a empresa já era cliente.",
      vidas: "Vidas (funcionários) pagas pela empresa neste mês, pela base atual.",
      vigenciaAplicada:
        "Valor por vida e prazo usados para a empresa neste mês, e de onde vêm: da vigência do parceiro (automática ou escolhida pelo diretor) ou do valor próprio da indicação. O seletor aparece só para quem ainda pode trocar.",
      valorDoMesDaEmpresa:
        "Vidas × valor por vida da empresa neste mês. Traço = a indicação não conta neste mês.",
      linhasIgnoradas:
        "Linhas do arquivo que não entraram como vieram, com o número da linha e o motivo. Empresas sem indicação na plataforma não aparecem aqui: são só contadas em Fora da plataforma.",
    },
    fechamento: {
      lote: "O cálculo do mês, parceiro por parceiro: valor do mês + ajuste + saldo anterior = total. Em preparação, confira, ajuste se preciso e marque quem recebe. Fechado, mostra a decisão e a resposta de cada parceiro.",
      marcar:
        "Marcado: o parceiro recebe o total agora. Desmarcado: o total acumula e entra como saldo anterior no mês seguinte. Quem tem valor a receber já vem marcado; a caixa do cabeçalho marca ou desmarca todos. Sem valor a pagar, a caixa fica bloqueada.",
      vendedores:
        "Quem fez as indicações deste parceiro que tiveram vidas no mês: o e-mail da conta que registrou ou o nome anotado pelo diretor.",
      vidas:
        "Vidas (funcionários) pagas no mês pelas empresas indicadas pelo parceiro, pela planilha do mês completo.",
      valorPorVida:
        "Regra do parceiro para indicações novas no mês. Cada indicação entra com a regra dela; Ver clientes mostra uma a uma.",
      valorDoMes:
        "Soma dos clientes do parceiro no mês: vidas pagas × valor por vida de cada indicação.",
      ajuste:
        "Acréscimo ou desconto (com sinal de menos) combinado com o parceiro, com o motivo. Soma no total, e o parceiro vê o motivo. Lance em “Ajustar o valor de um parceiro”; para tirar, salve 0.",
      saldoAnterior:
        "Valor que ficou acumulado no último mês fechado, porque o parceiro não recebeu naquele fechamento. Entra somado no Total deste mês. Fica em R$ 0,00 quando o mês anterior foi pago.",
      total:
        "Valor do mês + ajuste + saldo anterior. É o que o parceiro recebe se estiver marcado, ou o que acumula para o mês seguinte se não estiver.",
      decisao:
        "Pagar: o parceiro estava marcado e recebe o total. Acumular: o total passou para o mês seguinte como saldo anterior. Sem valor: não havia nada a pagar. Abaixo, quando e por quem foi decidido.",
      resposta:
        "O que o parceiro respondeu em Meus fechamentos: Confirmado ou Contestado, com a data e o comentário dele. “Aguardando” = ainda não respondeu. Ele responde uma vez só.",
      clienteVidas: "Vidas pagas pela empresa no mês, como gravadas no fechamento.",
      clienteValorPorVida: "Valor por vida usado para esta empresa no mês.",
      clienteValor: "Vidas × valor por vida. A soma desta coluna é o valor do mês do parceiro.",
      comoFoiPago:
        "Anotação de como cada parceiro foi pago (por exemplo, PIX em 05/11). O parceiro vê em Meus fechamentos. Pode ser corrigida depois; reabrir o lote apaga.",
      fecharLote:
        "Encerra o mês. Quem está marcado na tabela recebe agora; quem está desmarcado acumula, e o total dele entra como saldo anterior no mês seguinte. Depois de fechado, o parceiro vê o valor oficial em Meus fechamentos e responde se concorda. Para corrigir depois, use Reabrir o lote.",
      reabrirLote:
        "Volta o mês para Em preparação, para corrigir um erro. Valores e ajustes ficam; a decisão de pagar ou acumular, a resposta dos parceiros e o “como foi pago” são apagados, e o mês some de Meus fechamentos até fechar de novo. Só o último mês fechado pode ser reaberto.",
      revisaoDaIa:
        "Antes de fechar, a IA confere o cálculo de cada parceiro contra o mês anterior e aponta o que merece atenção: valores que mudaram muito, indicação ativa sem vidas, saldo acumulado há meses, ajuste sem motivo e prazos terminando. É só um alerta: quem decide é você.",
      registrados:
        "Todos os meses que já tiveram o cálculo preparado, do mais recente ao mais antigo. Clique no mês para abrir o fechamento dele.",
      situacao:
        "Em preparação: o cálculo foi feito, mas o lote ainda não foi fechado. Fechado: a decisão de pagar ou acumular está gravada e o parceiro já vê o valor oficial.",
      preparadoEm: "Data do último cálculo do mês: quando foi preparado, recalculado ou reaberto.",
    },
    equipe: {
      diretores:
        "Quem entra na área interna da Fortes Pay. Todos os diretores têm o mesmo acesso: aprovam parceiros, enviam a planilha, fecham o mês e convidam outros diretores.",
      acesso:
        "Gera um link para o diretor criar uma senha nova, quando ele esquecer a atual. Copie e envie: vale 24 horas e uma única vez. A sua própria senha você troca em Minha conta.",
      convites:
        "Convites para novos diretores. Gere o convite, copie o link na hora (ele aparece uma vez só) e envie à pessoa. Quem abre o link cria o próprio acesso e já entra: o convite é a aprovação.",
      situacaoDoConvite:
        "Aguardando cadastro: o link ainda não foi usado. Cadastro feito: a pessoa já criou o acesso. Expirado: passou da data de validade sem uso.",
    },
  },
} as const;
