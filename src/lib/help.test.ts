import { describe, expect, it } from "vitest";
import { help } from "./help";

// Todas as folhas de um grupo de textos, com o caminho ("diretor.fechamento.ajuste").
function leaves(node: unknown, path: string): [string, unknown][] {
  if (node !== null && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, `${path}.${key}`));
  }
  return [[path, node]];
}

describe("textos do i de ajuda", () => {
  const all = leaves(help, "help");

  it("cobre os quatro grupos de perfil", () => {
    expect(Object.keys(help)).toEqual(["todos", "vendedor", "parceiro", "diretor"]);
    expect(all.length).toBeGreaterThan(80);
  });

  it.each(all)("%s é uma frase completa e cabe no balão", (_path, text) => {
    expect(typeof text).toBe("string");
    const value = String(text);
    expect(value.trim()).toBe(value);
    expect(value.length).toBeGreaterThan(20);
    expect(value.length).toBeLessThanOrEqual(420);
    expect(value.endsWith(".")).toBe(true);
    expect(value).not.toMatch(/\s{2,}/);
  });

  // Decisão 29: o vendedor não vê nenhum valor. Vale para os textos dele e para os que ele divide
  // com os outros perfis (Resumo, Alterar senha).
  const sellerVisible = [
    ...leaves(help.todos, "help.todos"),
    ...leaves(help.vendedor, "help.vendedor"),
  ];

  it.each(sellerVisible)("%s não fala de dinheiro", (_path, text) => {
    expect(String(text)).not.toMatch(/R\$|valor|comiss|prazo|remunera|por vida/i);
  });
});
