import { describe, it, expect } from "vitest";
import { fixMojibake } from "./encoding";

describe("fixMojibake", () => {
  it("conserta cidade real corrompida (SÃO JOSÉ)", () => {
    // "SÃO JOSÉ" → lido como CP1252 e re-gravado → "SÃƒO JOSÃ‰"
    expect(fixMojibake("SÃƒO JOSÃ‰ DOS CAMPOS")).toBe("SÃO JOSÉ DOS CAMPOS");
  });

  it("conserta acentos minúsculos comuns em PT-BR", () => {
    expect(fixMojibake("JoÃ£o")).toBe("João");
    expect(fixMojibake("ConceiÃ§Ã£o")).toBe("Conceição");
    expect(fixMojibake("AndrÃ©")).toBe("André");
    expect(fixMojibake("Ã‚ngela")).toBe("Ângela");
  });

  it("NÃO altera texto já correto (acentos válidos)", () => {
    expect(fixMojibake("SÃO JOSÉ DOS CAMPOS")).toBe("SÃO JOSÉ DOS CAMPOS");
    expect(fixMojibake("João da Conceição")).toBe("João da Conceição");
    expect(fixMojibake("MARIA APARECIDA")).toBe("MARIA APARECIDA");
    expect(fixMojibake("Açaí e Pão")).toBe("Açaí e Pão");
  });

  it("NÃO altera texto ASCII puro", () => {
    expect(fixMojibake("ALESSANDRA ROSA LEMES")).toBe("ALESSANDRA ROSA LEMES");
    expect(fixMojibake("RUA CURITIBA, 217")).toBe("RUA CURITIBA, 217");
  });

  it("tolera null/undefined/vazio", () => {
    expect(fixMojibake(null)).toBe("");
    expect(fixMojibake(undefined)).toBe("");
    expect(fixMojibake("")).toBe("");
  });

  it("idempotente: aplicar 2x dá o mesmo resultado", () => {
    const once = fixMojibake("SÃƒO JOSÃ‰");
    expect(fixMojibake(once)).toBe(once);
    expect(once).toBe("SÃO JOSÉ");
  });
});
