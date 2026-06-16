import { describe, expect, it } from "vitest";
import { parseAddressField } from "./address-parser";

// ─── Casos reais esperados ────────────────────────────────────────────────────

describe("parseAddressField", () => {
  // ── 1. Caso completo com todos os componentes no campo street ─────────────

  it("extrai todos os campos de 'Rua Manoel Fiel Filho, 204, CEP 12233-690, Bosque dos eucaliptos'", () => {
    const result = parseAddressField(
      "Rua Manoel Fiel Filho, 204, CEP 12233-690, Bosque dos eucaliptos",
      {},
    );

    expect(result.street).toBe("Rua Manoel Fiel Filho");
    expect(result.number).toBe("204");
    expect(result.postalCode).toBe("12233690");
    expect(result.neighborhood).toBe("Bosque dos eucaliptos");
    expect(result.confidence).toBe("high");
    expect(result.parsedFallback).toEqual([]);
  });

  // ── 2. Variação com nº e hífen como separador ─────────────────────────────

  it("extrai campos de 'Rua X - nº 100 - Bairro Z - 98765-432'", () => {
    const result = parseAddressField("Rua X - nº 100 - Bairro Z - 98765-432", {});

    expect(result.street).toBe("Rua X");
    expect(result.number).toBe("100");
    expect(result.neighborhood).toBe("Z");
    expect(result.postalCode).toBe("98765432");
    expect(result.confidence).toBe("high");
  });

  // ── 3. Mínimo: só logradouro + número ────────────────────────────────────

  it("extrai rua e número de 'Rua X, 123' e aceita campos faltando", () => {
    const result = parseAddressField("Rua X, 123", {});

    expect(result.street).toBe("Rua X");
    expect(result.number).toBe("123");
    expect(result.postalCode).toBe("");
    expect(result.neighborhood).toBe("");
    // bairro e CEP faltando → low
    expect(result.confidence).toBe("low");
    expect(result.parsedFallback).toContain("neighborhood");
    expect(result.parsedFallback).toContain("postalCode");
  });

  // ── 4. Dados separados em campos distintos (campo street está limpo) ──────

  it("prioriza campos externos quando estão preenchidos", () => {
    const result = parseAddressField("Rua das Flores", {
      number: "55",
      neighborhood: "Centro",
      postalCode: "01310100",
      complement: "Sala 3",
    });

    expect(result.street).toBe("Rua das Flores");
    expect(result.number).toBe("55");
    expect(result.neighborhood).toBe("Centro");
    expect(result.postalCode).toBe("01310100");
    expect(result.complement).toBe("Sala 3");
    expect(result.confidence).toBe("high");
  });

  // ── 5. Campo street tem número mas campo externo tem número → externo vence ─

  it("campo externo sobrescreve número extraído do street", () => {
    const result = parseAddressField("Av. Paulista, 1000", {
      number: "900",
      neighborhood: "Bela Vista",
      postalCode: "01310100",
    });

    expect(result.street).toBe("Av. Paulista");
    expect(result.number).toBe("900"); // externo tem prioridade
    expect(result.neighborhood).toBe("Bela Vista");
  });

  // ── 6. Lixo / dados inconsistentes ───────────────────────────────────────

  it("retorna o que conseguir quando o campo é puro lixo", () => {
    const result = parseAddressField("???  /  ---  |||", {});

    // não deve lançar exceção
    expect(result).toBeDefined();
    expect(result.confidence).toBe("low");
    expect(result.parsedFallback.length).toBeGreaterThan(0);
  });

  it("retorna street preenchido mesmo que vazio puro", () => {
    const result = parseAddressField("", {});
    expect(result.street).toBe("");
    expect(result.confidence).toBe("low");
  });

  // ── 7. CEP sem máscara embutido ───────────────────────────────────────────

  it("detecta CEP sem traço: '12233690'", () => {
    const result = parseAddressField(
      "Rua Dom Pedro II, 77, 12233690, Jardim América",
      {},
    );

    expect(result.postalCode).toBe("12233690");
    expect(result.number).toBe("77");
    expect(result.street).toBe("Rua Dom Pedro II");
  });

  // ── 8. Número com letra (ex: 10A) ─────────────────────────────────────────

  it("aceita número com sufixo de letra: '10A'", () => {
    const result = parseAddressField("Rua XV de Novembro, 10A, Centro, 01013-001", {});

    expect(result.number).toBe("10A");
    expect(result.street).toBe("Rua XV de Novembro");
  });

  // ── 9. Complemento residual ───────────────────────────────────────────────

  it("coloca segmento residual não reconhecido no complement quando campo complement está vazio", () => {
    const result = parseAddressField(
      "Rua A, 5, 12345-678, Bairro B, Bloco 2 Apto 10",
      {},
    );

    // "Bloco 2 Apto 10" deve ir para complement
    expect(result.complement).toBe("Bloco 2 Apto 10");
  });

  // ── 10. rawStreet preserva o texto original ───────────────────────────────

  it("preserva o texto original em rawStreet", () => {
    const raw = "  Av. Brasil, 200, CEP 20000-000, Benfica  ";
    const result = parseAddressField(raw, {});
    expect(result.rawStreet).toBe("Av. Brasil, 200, CEP 20000-000, Benfica");
  });
});
