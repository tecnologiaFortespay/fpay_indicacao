# Roteiro de testes — Denis

Cada fatia tem um roteiro de ponta a ponta. O mesmo roteiro roda automatizado em `e2e/`.

## Fatia 1 — Importar o CSV do BI e ver vidas do mês por parceiro com o valor calculado

Antes: diretor e analista criados com `npm run bootstrap`.

1. Entre como **diretor**. A tela inicial é **Visão geral**; o menu tem Visão geral, Parceiros e Importações.
2. Em **Parceiros → Novo parceiro**, cadastre "Unidade Natal" (tipo Unidade, Natal/RN, meio de pagamento PIX com uma chave). Você cai na ficha do parceiro.
3. Em **Regras de remuneração → Nova vigência**, informe valor por vida `1,50`, vigência `agosto de 2026`, prazo em branco. Salve: a vigência aparece na lista.
4. Em **Indicações → Registrar indicação**, informe o CNPJ `11.222.333/0001-81` e a empresa. Salve: a indicação aparece como **Indicada**.
5. Em **Importações**, envie um CSV de setembro em que esse CNPJ tem 48 vidas (colunas grupo, empresa, CNPJ, vidas, mês). Você cai no detalhe do lote: linhas lidas, importadas e ignoradas, "todas as linhas entraram".
6. Em **Visão geral**, escolha setembro de 2026: Unidade Natal · 48 vidas · R$ 1,50 · R$ 72,00, e "Dados atualizados em … por …".
7. Envie o **mesmo** arquivo de novo: surge um novo lote e as vidas continuam 48 (não 96).
8. Envie um arquivo em que o CNPJ tem 50 vidas: a Visão geral passa a mostrar 50 e R$ 75,00. Na ficha do parceiro, a indicação está **Ativa**.
9. Entre como **analista**: a tela inicial é Importações, o menu não tem Parceiros, e digitar `/parceiros` na barra volta para Importações.
10. Como analista, envie um CSV com uma linha de CNPJ inválido: o lote mostra a linha ignorada com o motivo "CNPJ inválido.".

Esperado que **não** aconteça: vidas somadas ao reenviar; parceiro sem regra com valor diferente de zero (aparece "sem regra vigente"); analista enxergando parceiros, regras ou indicações.
