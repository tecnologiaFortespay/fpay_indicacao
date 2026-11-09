// Material que a IA recebe: só os números que o sistema já calculou, em JSON compacto e com
// rótulos em português. Nada de contato de parceiro (e-mail, telefone).
import { addMonths, competencyLabel } from "@/lib/competency";
import { formatCnpj } from "@/lib/cnpj";
import { normalizeText } from "@/lib/imports/bi";
import { referralStatusLabels, type ReferralStatus } from "@/lib/labels";

export type SheetCompany = { cnpj: string; company_name: string };

export type ReferralFact = {
  cnpj: string;
  company_name: string;
  partner_name: string;
  status: ReferralStatus;
};

const CLOSED_STATUSES: ReferralStatus[] = ["lost", "cancelled"];

// Palavras que não distinguem uma empresa de outra.
const COMMON_WORDS = new Set([
  "ltda",
  "eireli",
  "epp",
  "cia",
  "das",
  "dos",
  "comercio",
  "servicos",
  "industria",
  "empresa",
  "grupo",
  "brasil",
]);

function nameWords(name: string): Set<string> {
  return new Set(
    normalizeText(name)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !COMMON_WORDS.has(word)),
  );
}

export type NameCandidate = { empresa: string; cnpj: string; motivo: string };

// Empresas do arquivo que podem ser a indicação com CNPJ digitado errado: mesma raiz de CNPJ
// (matriz e filiais) ou nome parecido (a maior parte das palavras do nome menor em comum).
export function nameCandidates(
  target: SheetCompany,
  sheet: SheetCompany[],
  limit = 5,
): NameCandidate[] {
  const root = target.cnpj.slice(0, 8);
  const words = nameWords(target.company_name);
  const scored: (NameCandidate & { score: number })[] = [];
  for (const company of sheet) {
    if (company.cnpj === target.cnpj) {
      continue;
    }
    const base = { empresa: company.company_name, cnpj: formatCnpj(company.cnpj) };
    if (company.cnpj.slice(0, 8) === root) {
      scored.push({ ...base, motivo: "mesma raiz de CNPJ (matriz ou filial)", score: 2 });
      continue;
    }
    const other = nameWords(company.company_name);
    const shared = [...words].filter((word) => other.has(word)).length;
    const score = shared > 0 ? shared / Math.min(words.size, other.size) : 0;
    if (score >= 0.6) {
      scored.push({ ...base, motivo: "nome parecido", score });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ empresa, cnpj, motivo }) => ({ empresa, cnpj, motivo }));
}

export type ImportMaterialInput = {
  competency: string;
  partial: boolean;
  fileName: string;
  referrals: ReferralFact[];
  livesNow: Map<string, number>;
  livesPreviousMonth: Map<string, number>;
  // Vidas do mesmo mês antes deste envio; null quando não havia envio anterior do mês.
  livesBeforeUpload: Map<string, number> | null;
  // Todas as empresas do arquivo; só existe durante o envio (as não indicadas não são guardadas).
  sheet: SheetCompany[] | null;
};

export function importMaterial(input: ImportMaterialInput) {
  const open = input.referrals.filter((referral) => !CLOSED_STATUSES.includes(referral.status));
  const inSheet = new Set(input.sheet?.map((company) => company.cnpj) ?? []);
  const missing = input.sheet ? open.filter((referral) => !inSheet.has(referral.cnpj)) : [];
  return {
    mes: competencyLabel(input.competency),
    mes_anterior: competencyLabel(addMonths(input.competency, -1)),
    envio: input.partial
      ? "parcial: mês em andamento, vidas até o dia do envio; cliente sem vidas ainda pode pagar até o fim do mês"
      : "mês completo: enviado depois do fim do mês",
    arquivo: input.fileName,
    empresas_no_arquivo: input.sheet?.length ?? null,
    indicacoes: open.map((referral) => ({
      parceiro: referral.partner_name,
      empresa: referral.company_name,
      cnpj: formatCnpj(referral.cnpj),
      situacao: referralStatusLabels[referral.status],
      vidas_neste_envio: input.livesNow.get(referral.cnpj) ?? 0,
      vidas_no_envio_anterior_do_mes: input.livesBeforeUpload
        ? (input.livesBeforeUpload.get(referral.cnpj) ?? 0)
        : null,
      vidas_no_mes_anterior: input.livesPreviousMonth.get(referral.cnpj) ?? 0,
    })),
    possiveis_cnpj_errados: input.sheet
      ? missing
          .map((referral) => ({
            parceiro: referral.partner_name,
            empresa: referral.company_name,
            cnpj: formatCnpj(referral.cnpj),
            candidatos_no_arquivo: nameCandidates(referral, input.sheet ?? []),
          }))
          .filter((entry) => entry.candidatos_no_arquivo.length > 0)
      : "não verificado: a planilha completa só existe no momento do envio",
  };
}

export const IMPORT_TASK = `Tarefa: analisar um envio da planilha "Detalhamento Empresas" do BI.

- Compare cada indicação com o envio anterior do mesmo mês (quando houver) e com o mês anterior: quedas ou saltos fortes de vidas, indicação que sumiu, ativação nova.
- Em envio parcial, cliente sem vidas ainda não é inadimplente: trate como "ainda sem pagamento neste mês", nunca como inadimplência.
- Em "possiveis_cnpj_errados", cada indicação que não veio no arquivo traz empresas do arquivo com a mesma raiz de CNPJ ou nome parecido. Diga se parece a mesma empresa com o CNPJ digitado errado na indicação, ou outra filial, e recomende conferir o cadastro da indicação.`;

export type ClosingPartnerFact = {
  partner_name: string;
  lives: number;
  value_per_life: number | null;
  month_amount: number;
  adjustment: number;
  adjustment_note: string | null;
  previous_balance: number;
  total: number;
};

export type PreviousClosingFact = {
  lives: number;
  month_amount: number;
  total: number;
  decision: string | null;
};

export type ClosingReferralFact = ReferralFact & {
  // Primeiro mês pago ("2026-11-01"); null = ainda não pagou nenhum mês.
  activated_competency: string | null;
  lives: number;
  lives_previous_month: number;
  value_per_life: number | null;
  term: string;
};

// A situação é a de hoje, mas o mês revisado pode ser anterior: uma indicação que só começou a
// pagar depois dele aparecia como "Ativa" com zero vidas, e a IA apontava um problema que não
// existe. Nesse caso a IA recebe "ainda não rendia neste mês".
function situationInMonth(referral: ClosingReferralFact, competency: string): string {
  const firstPaid = referral.activated_competency?.slice(0, 7) ?? null;
  const paying = referral.status === "active" || referral.status === "delinquent";
  if (paying && (firstPaid === null || firstPaid > competency)) {
    return firstPaid
      ? `Ainda não rendia neste mês (rende desde ${competencyLabel(firstPaid)})`
      : "Ainda não rendia neste mês";
  }
  return referralStatusLabels[referral.status];
}

export function closingMaterial(input: {
  competency: string;
  items: ClosingPartnerFact[];
  previous: Map<string, PreviousClosingFact>;
  referrals: ClosingReferralFact[];
}) {
  return {
    mes: competencyLabel(input.competency),
    mes_anterior: competencyLabel(addMonths(input.competency, -1)),
    parceiros: input.items.map((item) => {
      const previous = input.previous.get(item.partner_name);
      return {
        parceiro: item.partner_name,
        vidas: item.lives,
        valor_por_vida_da_regra: item.value_per_life,
        valor_do_mes: item.month_amount,
        ajuste: item.adjustment,
        motivo_do_ajuste: item.adjustment_note,
        saldo_anterior_acumulado: item.previous_balance,
        total: item.total,
        mes_anterior: previous
          ? {
              vidas: previous.lives,
              valor_do_mes: previous.month_amount,
              total: previous.total,
              decisao:
                previous.decision === "pay"
                  ? "pago"
                  : previous.decision === "accumulate"
                    ? "acumulado"
                    : "sem valor",
            }
          : null,
        indicacoes: input.referrals
          .filter((referral) => referral.partner_name === item.partner_name)
          .filter((referral) => !CLOSED_STATUSES.includes(referral.status))
          .map((referral) => ({
            empresa: referral.company_name,
            situacao: situationInMonth(referral, input.competency),
            vidas: referral.lives,
            vidas_mes_anterior: referral.lives_previous_month,
            valor_por_vida: referral.value_per_life,
            prazo: referral.term,
          })),
      };
    }),
  };
}

export const CLOSING_TASK = `Tarefa: revisar o cálculo de um mês antes de o diretor fechar o lote.

Aponte, quando houver:
- valor do mês que mudou muito em relação ao mês anterior sem explicação nas vidas;
- indicação ativa com zero vidas no mês;
- saldo acumulado há vários meses (saldo anterior alto ou acumulado de novo);
- ajuste sem motivo, ou motivo que não explica o valor;
- prazo de indicação terminando neste mês ou no próximo;
- parceiro sem regra vigente (valor por vida vazio).

A decisão de pagar ou acumular é do diretor: não decida por ele nem recomende pagar ou acumular.`;
