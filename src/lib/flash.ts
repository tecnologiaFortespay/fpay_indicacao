// Mensagens mostradas depois de uma ação que muda a estrutura da página. A ação redireciona para a
// própria página com ?msg=<chave> (a mensagem devolvida pelo formulário sumiria com ele).
export const flashMessages = {
  parceiro_aprovado: "Parceiro aprovado. O acesso dele está liberado.",
  cadastro_recusado: "Cadastro recusado. O parceiro vê o motivo ao entrar.",
  vigencia_removida: "Vigência removida.",
  lote_fechado: "Lote fechado. Nada mais entra neste mês.",
  resposta_registrada: "Resposta registrada. A Fortes Pay já consegue ver.",
  situacao_atualizada: "Situação atualizada.",
  analise_pedida: "Análise pedida à IA. O resultado aparece abaixo em alguns instantes.",
} as const;

export type FlashKey = keyof typeof flashMessages;

export function flashText(key: string | undefined | null): string | null {
  if (!key) {
    return null;
  }
  return key in flashMessages ? flashMessages[key as FlashKey] : null;
}

// Destino de redirect com a mensagem; preserva os parâmetros que a página já tinha.
export function withFlash(path: string, key: FlashKey): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("msg", key);
  return `${base}?${params}`;
}
