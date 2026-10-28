# CSV do BI — formato aceito (hipótese até chegar o arquivo real)

O sistema aceita o arquivo **no formato em que sai do BI**, sem cabeçalho próprio. Enquanto o
arquivo real não chega, a importação assume as colunas abaixo. Quando o arquivo chegar, só
`src/lib/imports/csv.ts` (e seus testes) precisa mudar.

| Coluna esperada | Como é localizada                                       | Uso                                                                      |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| grupo           | nome contém `grupo`                                     | `companies.group_name` (opcional)                                        |
| empresa         | nome contém `empresa` ou `razao`/`razão` ou `cliente`   | `companies.name`                                                         |
| CNPJ            | nome contém `cnpj`                                      | chave; só caracteres alfanuméricos, com dígitos verificadores conferidos |
| vidas           | nome contém `vida`                                      | inteiro ≥ 0                                                              |
| mês             | nome contém `mes`, `mês` ou `competencia`/`competência` | `YYYY-MM`, `MM/YYYY`, `YYYY-MM-DD` ou `DD/MM/YYYY` (usa o mês)           |

Regras da leitura:

- Codificação: UTF-8 (com ou sem BOM); se o arquivo não for UTF-8 válido, lê como Windows-1252.
- Separador: `;` ou `,`, detectado na linha de cabeçalho (o que aparecer mais vezes). Aspas são respeitadas.
- Colunas são encontradas pelo nome normalizado (sem acento, sem caixa); a ordem não importa; colunas extras são ignoradas.
- Linha sem CNPJ válido, sem mês reconhecível ou sem vidas numéricas é **ignorada** e aparece no log do lote com o motivo.
- Linhas idênticas (mesmo CNPJ, mês e vidas) contam uma vez. Mesmo CNPJ e mês com vidas diferentes **somam** e aparecem no log como "mescladas".
- Cada mês presente no arquivo **substitui por inteiro** os dados daquele mês no sistema. Subir o mesmo arquivo duas vezes não duplica vidas.
- Linhas de um mês já fechado são ignoradas (motivo "competência fechada").
- Limite: 5 MB e 50.000 linhas por arquivo.
