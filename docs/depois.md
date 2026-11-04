# Depois — anotado, não implementado

Itens que pareceram úteis durante o desenvolvimento, mas não estão em `docs/requisitos.md`.
Regra 4 da seção 11: nada fora do documento entra sem decisão explícita.

- Re-indicar um CNPJ cuja indicação anterior foi perdida ou cancelada (hoje o CNPJ é único para sempre).
- Inativar ou suspender um parceiro ativo (hoje só existem pendente, ativo e recusado).
- Criar diretor pela interface (hoje: `npm run bootstrap`, feito por quem administra o projeto).
- Alerta "este CNPJ já era cliente pagante antes da indicação" para o diretor conferir (o export do BI traz a coluna "Prim cashin", data do primeiro cash-in da empresa, que resolve isso sem outra fonte).
- Envio automático do link de convite por e-mail (hoje o diretor copia o link e envia como preferir).
- Registro da data em que a Fortes Pay pagou a nota e do comprovante (a tabela `payments` da proposta inicial saiu do MVP; o fechamento já registra pago/acumulado, data, quem decidiu e o texto livre "como foi pago").
- Meio de pagamento estruturado do parceiro (PIX, banco, cartão): saiu em 28/10/2026 por decisão do Diego (docs/decisoes.md).
- Histórico de mudanças da configuração de uma indicação (hoje a configuração vale para todos os meses abertos; os fechados guardam o valor do fechamento).
- Exportar o fechamento em CSV/PDF.
- Edição do próprio cadastro pelo parceiro (hoje só o diretor edita).
- Vários logins para o mesmo parceiro.
- CNPJ/CPF do parceiro para emissão da nota.
- Vendedor (fase 2): `sellers`, `seller_commissions`, comissão única no fechamento do cliente, relatório por vendedor.
- Automação da importação do BI (somente leitura, via time da Soma).
- Penetração por região (depende da fonte de município/UF, a confirmar).
- Carga inicial do histórico da planilha da Géssica.
- CI no GitHub da Fortes Pay (rodar os testes a cada push; o deploy na Vercel já é automático).
- Avisar o parceiro por e-mail quando o mês dele é fechado (hoje ele vê ao entrar no painel).
- Parceiro alterar a resposta ao fechamento depois de confirmar/contestar (hoje a tela mostra só a resposta dada).
