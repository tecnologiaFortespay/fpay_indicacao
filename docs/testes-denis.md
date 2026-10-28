# Roteiro de testes — Denis

Cada fatia tem um roteiro de ponta a ponta. O mesmo roteiro roda automatizado em `e2e/`.

## Fatia 1 — Importar o CSV do BI e ver vidas do mês por parceiro com o valor calculado

Antes: diretor e analista criados com `npm run bootstrap`; um parceiro "Unidade Natal" já aprovado (pelo roteiro da Fatia 2).

1. Entre como **diretor**. A tela inicial é **Visão geral**; o menu tem Visão geral, Parceiros e Importações.
2. Em **Parceiros**, abra "Unidade Natal". Você cai na ficha do parceiro.
3. Em **Regras de remuneração → Nova vigência**, informe valor por vida `1,50`, vigência `agosto de 2026`, prazo em branco. Salve: a vigência aparece na lista.
4. Em **Indicações → Registrar indicação**, informe o CNPJ `11.222.333/0001-81` e a empresa. Salve: a indicação aparece como **Indicada**.
5. Em **Importações**, envie um CSV de setembro em que esse CNPJ tem 48 vidas (colunas grupo, empresa, CNPJ, vidas, mês). Você cai no detalhe do lote: linhas lidas, importadas e ignoradas, "todas as linhas entraram".
6. Em **Visão geral**, escolha setembro de 2026: Unidade Natal · 48 vidas · R$ 1,50 · R$ 72,00, e "Dados atualizados em … por …".
7. Envie o **mesmo** arquivo de novo: surge um novo lote e as vidas continuam 48 (não 96).
8. Envie um arquivo em que o CNPJ tem 50 vidas: a Visão geral passa a mostrar 50 e R$ 75,00. Na ficha do parceiro, a indicação está **Ativa**.
9. Entre como **analista**: a tela inicial é Importações, o menu não tem Parceiros, e digitar `/parceiros` na barra volta para Importações.
10. Como analista, envie um CSV com uma linha de CNPJ inválido: o lote mostra a linha ignorada com o motivo "CNPJ inválido.".

Esperado que **não** aconteça: vidas somadas ao reenviar; parceiro sem regra com valor diferente de zero (aparece "sem regra vigente"); analista enxergando parceiros, regras ou indicações.

## Fatia 2 — Cadastro de parceiro por convite, aprovação com regra e meio de pagamento obrigatórios

1. Entre como **diretor**, vá em **Parceiros**. Não existe mais "novo parceiro": o cadastro entra só por convite.
2. Em **Convites → Gerar convite**, informe "Unidade Teresina", tipo Unidade, validade padrão (7 dias). Copie o link exibido (ele aparece uma única vez; o sistema guarda só uma impressão digital dele).
3. Em uma janela anônima, abra o link: a tela mostra "Cadastro · Unidade Teresina" e a validade. Preencha cidade/UF, responsável, telefone, e-mail, senha e (opcional) o meio de pagamento. Envie: você cai em **Cadastro em análise** e não consegue entrar no painel.
4. Abra o link de novo: "Convite já utilizado".
5. Como diretor, em **Parceiros → Aguardando aprovação**, abra Teresina. Tente **Aprovar cadastro** sem valor por vida: bloqueado. Com PIX sem chave: bloqueado.
6. Aprove com valor por vida `2,00`, vigência `outubro de 2026`, prazo em branco, PIX com chave. A ficha passa a **Ativo** e mostra a vigência.
7. Na janela do parceiro, recarregue: entra em **Meu painel** com o nome da unidade.
8. Teresina aparece na lista de parceiros com cidade/UF, tipo e "Ativo".
9. Recusa: gere outro convite, faça o cadastro em janela anônima e, como diretor, **Recusar cadastro** com motivo. O parceiro vê "Cadastro não aprovado" e o motivo.
10. Senha: em **Entrar → Esqueci minha senha**, informe um e-mail; o link do e-mail leva a **Definir nova senha**; depois entre com a senha nova. (No ambiente local, o e-mail aparece no Mailpit em http://127.0.0.1:54344.)

Esperado que **não** aconteça: link público de cadastro; parceiro ativo sem regra ou sem meio de pagamento; parceiro pendente vendo qualquer tela interna; convite aceito duas vezes ou depois da validade.
