// Busca da lista de indicações do diretor: trecho do nome da empresa (sem diferenciar maiúsculas
// nem acentos) ou do CNPJ (com ou sem pontuação; vale também para CNPJ alfanumérico).
type Searchable = { company_name: string; cnpj: string };

function plainText(value: string): string {
  // NFD separa os acentos em marcas (\p{M}), que saem; "São José" vira "sao jose".
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

function cnpjKey(value: string): string {
  return value.replace(/[\s./-]/g, "").toUpperCase();
}

export function matchesReferralSearch(referral: Searchable, query: string): boolean {
  const text = plainText(query);
  if (text === "") {
    return true;
  }
  if (plainText(referral.company_name).includes(text)) {
    return true;
  }
  const key = cnpjKey(query);
  return key !== "" && cnpjKey(referral.cnpj).includes(key);
}
