import { describe, it, expect } from "vitest";
import { fixMojibake, toAsciiText } from "./encoding";

// Entradas de mojibake construidas com escapes \u (inequivocas, nao dependem do
// encoding do arquivo). Ex.: a-til (U+00E3) corrompido = U+00C3 U+00A3.
const SAO_JOSE_MOJI = "SÃ£o JosÃ© dos Campos SP"; // "São José ..."
const LINDOIA_MOJI = "LindÃ³ia";                            // "Lindóia"
const JOAO_MOJI = "JoÃ£o";                                  // "João"
const CONCEICAO_MOJI = "ConceiÃ§Ã£o";             // "Conceição"

describe("fixMojibake", () => {
  it("conserta cidade real do banco (Sao Jose, minusculo)", () => {
    expect(fixMojibake(SAO_JOSE_MOJI)).toBe("São José dos Campos SP");
  });

  it("conserta acentos PT-BR variados", () => {
    expect(fixMojibake(LINDOIA_MOJI)).toBe("Lindóia"); // Lindóia
    expect(fixMojibake(JOAO_MOJI)).toBe("João");       // João
    expect(fixMojibake(CONCEICAO_MOJI)).toBe("Conceição"); // Conceição
  });

  it("NAO altera texto ja correto nem ASCII", () => {
    expect(fixMojibake("São José")).toBe("São José");
    expect(fixMojibake("ALESSANDRA ROSA")).toBe("ALESSANDRA ROSA");
    expect(fixMojibake("RUA CURITIBA, 217")).toBe("RUA CURITIBA, 217");
  });

  it("tolera null/undefined/vazio", () => {
    expect(fixMojibake(null)).toBe("");
    expect(fixMojibake(undefined)).toBe("");
    expect(fixMojibake("")).toBe("");
  });
});

describe("toAsciiText — saida sempre ASCII", () => {
  it("repara mojibake E remove acento (cidade real)", () => {
    expect(toAsciiText(SAO_JOSE_MOJI)).toBe("Sao Jose dos Campos SP");
    expect(toAsciiText(LINDOIA_MOJI)).toBe("Lindoia");
    expect(toAsciiText(JOAO_MOJI)).toBe("Joao");
    expect(toAsciiText(CONCEICAO_MOJI)).toBe("Conceicao");
  });

  it("remove acento de texto ja correto", () => {
    expect(toAsciiText("São José")).toBe("Sao Jose");
    expect(toAsciiText("Conceição")).toBe("Conceicao");
    expect(toAsciiText("Ângela")).toBe("Angela"); // Ângela
  });

  it("ASCII puro passa intacto", () => {
    expect(toAsciiText("ALESSANDRA ROSA LEMES")).toBe("ALESSANDRA ROSA LEMES");
  });

  it("garante 0 caracteres nao-ASCII na saida", () => {
    const out = toAsciiText(SAO_JOSE_MOJI);
    expect([...out].every((c) => c.charCodeAt(0) <= 0x7f)).toBe(true);
  });

  it("tolera null/undefined/vazio", () => {
    expect(toAsciiText(null)).toBe("");
    expect(toAsciiText(undefined)).toBe("");
  });
});
