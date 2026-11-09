# Arquivo do BI — "Detalhamento Empresas"

A importação lê a planilha **Detalhamento Empresas** exatamente como o BI da Fortes Pay a exporta
(Power BI → Exportar dados → Excel), sem cabeçalho próprio, em **.xlsx ou .csv**. Desde 09/11/2026
o modelo enviado é o CSV salvo pelo Google Planilhas ("Planilha sem título - Export.csv"; ver
"O mesmo arquivo em CSV" abaixo). Exemplo recebido em 28/10/2026:
`Detalhamento Empresas (77).xlsx`, 155 KB, cerca de 1.800 CNPJs (todas as empresas clientes).
O arquivo real não é versionado (dados de clientes); `*.xlsx` está no `.gitignore`.

## Como o arquivo é

- Uma aba ("Export") e uma linha de cabeçalho com 17 colunas:
  `Grupo Empresarial | nome_empresa | cnpj | Empresas | Prim cashin | Faturamento | Emp. Cash-in | Fat. /Empresa | Contas Cad | C. Cash-in | Fat./conta | Novas contas | Volume Cash-in | Cliente SE | Vol SE | Inadimp. | Custos Onboard.`
- Linhas em três níveis, como a matriz do Power BI: subtotal do grupo (`nome_empresa` = "Total"),
  subtotal da empresa (`cnpj` = "Total") e a linha do CNPJ. Só a linha do CNPJ é dado; as outras
  são estrutura e não contam como lidas.
- O mês não é coluna: está na última linha, "Filtros aplicados: … Ano é 2026 … Incluídos (1)
  outubro (Mês)".
- Strings inline, números como o Excel grava (`2728`), datas como número de série. O leitor
  (`src/lib/imports/xlsx.ts`) também aceita o mesmo arquivo salvo de novo pelo Excel (strings
  compartilhadas, referências de célula).

## O mesmo arquivo em CSV

Exemplo recebido em 09/11/2026: `Planilha sem título - Export.csv`, 190 KB, novembro/2026, 1.256
linhas de CNPJ (4 com CPF, ignoradas). As colunas e os três níveis de linha são os mesmos do
.xlsx, com três diferenças que o leitor (`src/lib/imports/csv.ts` + `bi.ts`) trata:

- **Nomes só nos subtotais.** O grupo aparece na linha de subtotal do grupo e a empresa na de
  subtotal da empresa; a linha do CNPJ traz as duas colunas em branco. O nome vale para os CNPJs
  seguintes até o próximo subtotal (há empresa com vários CNPJs e grupo sem nome).
- **Números formatados em português:** `2.657` (ponto de milhar), `R$ 5.906`, `"R$ 41,60"`.
  `C. Cash-in` é lida sem o ponto de milhar; célula vazia conta 0.
- **Rodapé numa célula de várias linhas** entre aspas: `"Filtros aplicados:` … `Incluídos (1)
novembro (Mês)` …`"`, depois de uma linha de total geral e uma linha em branco.

Também aceita o CSV do Excel em português (separador `;`, codificação Windows-1252). O "Total"
do BI conta contas distintas no grupo, então a soma das linhas pode passar um pouco do total do
rodapé (44 vidas no exemplo de novembro; 39 no .xlsx de outubro): é do BI, não da leitura.

## O que a importação lê

| Coluna              | Como é localizada (sem acento, sem caixa) | Uso                                                                                     |
| ------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `cnpj`              | nome `cnpj`                               | chave: 14 caracteres alfanuméricos, dígitos verificadores conferidos                    |
| `C. Cash-in`        | nome `c. cash-in` (aceita também `vidas`) | **vidas pagas do mês**, confirmado pela Fortes Pay em 09/11/2026. Célula vazia conta 0. |
| `nome_empresa`      | nome `nome_empresa` ou `empresa`          | `companies.name`                                                                        |
| `Grupo Empresarial` | nome `grupo empresarial` ou `grupo`       | `companies.group_name`                                                                  |

As demais colunas são ignoradas. Quando o arquivo mudar, só `src/lib/imports/bi.ts` (e seus
testes em `src/lib/imports/bi.test.ts`) precisa mudar; o gerador de arquivos de teste no mesmo
formato está em `tests/bi-export.ts`.

## Regras

0. **Conferir antes de gravar.** "Conferir arquivo" roda a importação no banco e desfaz
   (`preview_import`): mostra vidas de hoje × do arquivo, mudança de situação e valor do mês de
   cada indicação, totais por parceiro, indicações ausentes e linhas que não entram. Só
   "Confirmar e importar" grava, e só se for o mesmo arquivo conferido.
1. **Mês de referência.** Quem importa informa o mês (o mesmo filtrado no BI). Se o rodapé
   "Filtros aplicados" trouxer outro mês, a importação é recusada; se trouxer mais de um mês,
   idem (exporte um mês por vez). Sem rodapé, vale o mês informado. Mês futuro não é aceito.
2. **Só empresas indicadas entram.** O arquivo lista todas as clientes da Fortes Pay; a função
   SQL `import_lives` grava só os CNPJs que têm indicação na plataforma e conta as demais como
   "fora da plataforma" (`import_batches.rows_skipped`), sem gravar nada delas.
3. Linha com CNPJ inválido ou `C. Cash-in` não numérico é **ignorada** e aparece no log do lote
   com o motivo. Linhas idênticas contam uma vez; CNPJ repetido com valores diferentes **soma**
   e aparece no log como "mesclada".
4. O envio **substitui por inteiro** o mês informado, também quando nenhuma empresa indicada
   aparece no arquivo (as vidas do mês ficam zeradas). Subir o mesmo arquivo duas vezes não
   duplica vidas.
5. Se o mês informado for o mais recente, as indicações com vidas > 0 passam a **Ativa**
   (gravando o primeiro mês pago) e as ativas ausentes passam a **Inadimplente**.
6. Linhas de um mês já fechado não entram e aparecem no log ("Mês já fechado").
7. Limite: 4 MB e 50.000 linhas (a Vercel recusa requisições acima de 4,5 MB).

## Hipóteses em aberto

- ~~`C. Cash-in` é a medida de "vidas pagas do mês"~~: confirmado em 09/11/2026 (decisão 17).
- O export mostra o mês até a data da exportação (no dia 10 só aparece quem já pagou); por isso
  o fechamento exige uma importação feita depois do fim do mês.
- No arquivo de exemplo, 4 das 1.220 linhas trazem um CPF com zeros à esquerda no lugar do CNPJ
  (pessoa física/MEI no BI); são ignoradas com o motivo "CNPJ inválido.", como deve ser, já que a
  plataforma só trata CNPJ.
- `Prim cashin` (mês do primeiro cash-in da empresa, no CSV como `mar./ 26`) não é usada; serviria para o alerta
  "cliente já pagava antes da indicação" (docs/depois.md).
