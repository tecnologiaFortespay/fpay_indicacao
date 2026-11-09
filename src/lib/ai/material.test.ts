import { describe, expect, it } from "vitest";
import { closingMaterial, importMaterial, nameCandidates } from "./material";

describe("nameCandidates", () => {
  const sheet = [
    { cnpj: "98765432000100", company_name: "PADARIA PAO QUENTE LTDA" },
    { cnpj: "12345678000290", company_name: "FILIAL QUALQUER" },
    { cnpj: "55566677000100", company_name: "OUTRA EMPRESA SA" },
  ];

  it("acha a mesma raiz de CNPJ e o nome parecido, sem acento nem LTDA", () => {
    const target = { cnpj: "12345678000110", company_name: "Padaria Pão Quente" };
    expect(nameCandidates(target, sheet)).toEqual([
      {
        empresa: "FILIAL QUALQUER",
        cnpj: "12.345.678/0002-90",
        motivo: "mesma raiz de CNPJ (matriz ou filial)",
      },
      { empresa: "PADARIA PAO QUENTE LTDA", cnpj: "98.765.432/0001-00", motivo: "nome parecido" },
    ]);
  });

  it("não aponta empresa sem palavra em comum", () => {
    const target = { cnpj: "11111111000100", company_name: "Farmácia Central" };
    expect(nameCandidates(target, sheet)).toEqual([]);
  });
});

describe("importMaterial", () => {
  const base = {
    competency: "2026-10",
    partial: true,
    fileName: "outubro.xlsx",
    referrals: [
      {
        cnpj: "12345678000110",
        company_name: "Padaria Pão Quente",
        partner_name: "Natal",
        status: "active" as const,
      },
      {
        cnpj: "22222222000100",
        company_name: "Perdida",
        partner_name: "Natal",
        status: "lost" as const,
      },
    ],
    livesNow: new Map([["12345678000110", 40]]),
    livesPreviousMonth: new Map([["12345678000110", 37]]),
  };

  it("lista as indicações abertas com vidas deste envio, do anterior e do mês passado", () => {
    const material = importMaterial({
      ...base,
      livesBeforeUpload: new Map([["12345678000110", 35]]),
      sheet: [{ cnpj: "12345678000110", company_name: "PADARIA PAO QUENTE" }],
    });
    expect(material.mes).toBe("outubro de 2026");
    expect(material.envio).toMatch(/^parcial/);
    expect(material.indicacoes).toEqual([
      {
        parceiro: "Natal",
        empresa: "Padaria Pão Quente",
        cnpj: "12.345.678/0001-10",
        situacao: "Ativa",
        vidas_neste_envio: 40,
        vidas_no_envio_anterior_do_mes: 35,
        vidas_no_mes_anterior: 37,
      },
    ]);
    expect(material.possiveis_cnpj_errados).toEqual([]);
  });

  it("sem a planilha inteira, diz que a checagem de CNPJ não foi feita", () => {
    const material = importMaterial({ ...base, livesBeforeUpload: null, sheet: null });
    expect(material.indicacoes[0].vidas_no_envio_anterior_do_mes).toBeNull();
    expect(material.possiveis_cnpj_errados).toMatch(/^não verificado/);
  });
});

describe("closingMaterial", () => {
  it("junta parceiro, mês anterior e indicações abertas", () => {
    const material = closingMaterial({
      competency: "2026-09",
      items: [
        {
          partner_name: "Natal",
          lives: 55,
          value_per_life: 2,
          month_amount: 110,
          adjustment: -10,
          adjustment_note: null,
          previous_balance: 0,
          total: 100,
        },
      ],
      previous: new Map([["Natal", { lives: 50, month_amount: 90, total: 90, decision: "pay" }]]),
      referrals: [
        {
          cnpj: "12345678000110",
          company_name: "Empresa A",
          partner_name: "Natal",
          status: "active",
          activated_competency: "2026-08-01",
          lives: 55,
          lives_previous_month: 50,
          value_per_life: 2,
          term: "sem prazo",
        },
      ],
    });
    expect(material.parceiros[0]).toMatchObject({
      parceiro: "Natal",
      ajuste: -10,
      motivo_do_ajuste: null,
      mes_anterior: { vidas: 50, total: 90, decisao: "pago" },
      indicacoes: [{ empresa: "Empresa A", situacao: "Ativa", vidas: 55, prazo: "sem prazo" }],
    });
  });

  it("indicação que só começou a pagar depois do mês não aparece como ativa sem vidas", () => {
    const material = closingMaterial({
      competency: "2026-09",
      items: [
        {
          partner_name: "Natal",
          lives: 30,
          value_per_life: 2,
          month_amount: 60,
          adjustment: 0,
          adjustment_note: null,
          previous_balance: 0,
          total: 60,
        },
      ],
      previous: new Map(),
      referrals: [
        {
          cnpj: "12345678000110",
          company_name: "Farmácia Nova",
          partner_name: "Natal",
          status: "active",
          activated_competency: "2026-11-01",
          lives: 0,
          lives_previous_month: 0,
          value_per_life: null,
          term: "6 meses",
        },
        {
          cnpj: "98765432000100",
          company_name: "Clínica Antiga",
          partner_name: "Natal",
          status: "delinquent",
          activated_competency: "2026-09-01",
          lives: 25,
          lives_previous_month: 0,
          value_per_life: 2,
          term: "sem prazo",
        },
      ],
    });
    expect(material.parceiros[0].indicacoes).toMatchObject([
      {
        empresa: "Farmácia Nova",
        situacao: "Ainda não rendia neste mês (rende desde novembro de 2026)",
      },
      { empresa: "Clínica Antiga", situacao: "Inadimplente" },
    ]);
  });
});
