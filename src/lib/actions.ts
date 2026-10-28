import "server-only";

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
      return detail || "Confira os campos informados.";
    case "RULE_DUPLICATE":
      return "Já existe uma vigência começando nesse mês para este parceiro.";
    case "REFERRAL_DUPLICATE":
      return `CNPJ já indicado em ${detail}.`;
    default:
      break;
  }
  switch (error.code) {
    case "42501":
      return "Você não tem permissão para esta operação.";
    case "P0002":
      return "Registro não encontrado ou indisponível para este acesso.";
    case "23505":
      return "Já existe um registro com esta identificação.";
    case "23514":
    case "22023":
    case "22P02":
    case "22003":
      return "Confira os campos e o formato das informações.";
    default:
      return "Não foi possível salvar. Confira os dados e tente novamente.";
  }
}

export function formValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
