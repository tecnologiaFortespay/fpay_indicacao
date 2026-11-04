import "server-only";
import { referralStatusLabels } from "@/lib/labels";

type DatabaseError = {
  code?: string;
  message: string;
  details?: string | null;
};

// Converte o erro vindo das funções SQL em mensagem para o formulário.
export function databaseError(error: DatabaseError): string {
  const detail = error.details?.trim() ?? "";
  switch (error.message) {
    case "PARTNER_FIELDS":
    case "RULE_FIELDS":
    case "REFERRAL_FIELDS":
    case "IMPORT_FIELDS":
    case "INVITATION_FIELDS":
    case "REGISTRATION_FIELDS":
    case "APPROVAL_FIELDS":
    case "CLOSING_FIELDS":
    case "AI_FIELDS":
    case "RESET_FIELDS":
      return detail || "Confira os campos informados.";
    case "RULE_LOCKED":
      return `Mês fechado (${detail}): vigências até esse mês não mudam mais. Crie uma vigência a partir de um mês aberto.`;
    case "RESET_INVALID":
      return "Este link de nova senha é inválido, expirou ou já foi usado. Peça um novo à Fortes Pay.";
    case "INVITATION_INVALID":
      return "Convite inválido, expirado ou já utilizado.";
    case "ALREADY_REGISTERED":
      return "Esta conta já tem um cadastro na plataforma. Entre com ela.";
    case "RULE_DUPLICATE":
      return "Já existe uma vigência começando nesse mês para este parceiro.";
    case "REFERRAL_DUPLICATE":
      return `CNPJ já indicado em ${detail}.`;
    case "REFERRAL_TRANSITION":
      return transitionMessage(detail);
    default:
      break;
  }
  switch (error.code) {
    case "42501":
      return "Você não tem permissão para esta operação.";
    case "P0002":
      return "Este registro não existe mais ou não está disponível para o seu acesso. Recarregue a página.";
    case "23505":
      return "Já existe um registro com estes dados. Recarregue a página para ver.";
    case "23514":
    case "22023":
    case "22P02":
    case "22003":
    case "22001":
      return "Confira os campos: algum valor está fora do formato ou do tamanho aceito.";
    case "57014":
      return "O banco demorou para responder. Tente de novo em instantes.";
    case "40001":
    case "40P01":
      return "Outra pessoa alterou estes dados ao mesmo tempo. Recarregue a página e tente de novo.";
    case "PGRST202":
      return "Esta função ainda não está disponível no banco (atualização pendente). Avise a equipe técnica.";
    default:
      console.error("Erro do banco sem tradução:", error.code, error.message, error.details);
      return "Não foi possível concluir agora. Tente de novo em instantes; se continuar, avise a Fortes Pay.";
  }
}

export function formValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function statusLabel(status: string): string {
  return referralStatusLabels[status as keyof typeof referralStatusLabels] ?? status;
}

// detail vem como "situação_atual>situação_pedida".
function transitionMessage(detail: string): string {
  const [current, requested] = detail.split(">");
  return `Não é possível mudar de «${statusLabel(current)}» para «${statusLabel(requested)}». Recarregue a página.`;
}
