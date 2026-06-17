import { describe, it, expect } from "vitest";
import { resolveRegion, normalizeBairro } from "./region-resolver";

describe("normalizeBairro", () => {
  it("remove acento, caixa e pontuação", () => {
    expect(normalizeBairro("Bosque dos Eucaliptos")).toBe("bosque dos eucaliptos");
    expect(normalizeBairro("Bosque dos eucaliptos")).toBe("bosque dos eucaliptos");
    expect(normalizeBairro("  Jardim  América. ")).toBe("jardim america");
    expect(normalizeBairro(null)).toBe("");
  });
});

describe("resolveRegion — bairros reais dos exemplos", () => {
  it("Bosque dos Eucaliptos → Sul (alta)", () => {
    const r = resolveRegion("Bosque dos eucaliptos");
    expect(r.regiao).toBe("Sul");
    expect(r.confidence).toBe("alta");
  });

  it("Jardim América → Sul", () => {
    expect(resolveRegion("Jardim América").regiao).toBe("Sul");
  });

  it("Floresta (Condomínio Floresta) → Leste", () => {
    expect(resolveRegion("Condomínio Floresta").regiao).toBe("Leste");
  });

  it("tolera erro de digitação/caixa", () => {
    expect(resolveRegion("jardim satelite").regiao).toBe("Sul");
    expect(resolveRegion("CAMPO DOS ALEMÃES").regiao).toBe("Sul");
  });
});

describe("resolveRegion — ambíguos resolvidos por CEP", () => {
  it("Jardim Ismênia sem CEP → Leste, mas confiança baixa (fronteira)", () => {
    const r = resolveRegion("Jardim Ismênia");
    expect(r.regiao).toBe("Leste");
    expect(r.confidence).toBe("baixa");
  });

  it("Jardim Ismênia com CEP 12220 → Leste, confiança média", () => {
    const r = resolveRegion("Jardim Ismênia", "12220-700");
    expect(r.regiao).toBe("Leste");
    expect(r.confidence).toBe("media");
    expect(r.method).toBe("ambiguo-cep");
  });

  it("Royal Park com CEP 12246 → Oeste", () => {
    const r = resolveRegion("Royal Park", "12246-871");
    expect(r.regiao).toBe("Oeste");
  });
});

describe("resolveRegion — bairro vazio / desconhecido", () => {
  it("bairro vazio + CEP 12233 → Sul via CEP", () => {
    const r = resolveRegion("", "12233-690");
    expect(r.regiao).toBe("Sul");
    expect(r.method).toBe("cep");
  });

  it("bairro fora de SJC (Tinga/litoral) sem CEP → indefinida", () => {
    const r = resolveRegion("Tinga");
    expect(r.regiao).toBeNull();
    expect(r.method).toBe("indefinida");
  });

  it("nada informado → indefinida", () => {
    expect(resolveRegion(null).regiao).toBeNull();
  });
});

describe("resolveRegion — abreviações expandidas", () => {
  it("Jd. Satélite → Sul", () => {
    expect(resolveRegion("Jd. Satélite").regiao).toBe("Sul");
  });

  it("Vl. Maria → Centro", () => {
    expect(resolveRegion("Vl. Maria").regiao).toBe("Centro");
  });

  it("Res. Gazzo → Sul", () => {
    expect(resolveRegion("Res. Gazzo").regiao).toBe("Sul");
  });

  it("Conj Hab Sao Geraldo (abreviado, sem acento) → Norte", () => {
    expect(resolveRegion("Conj Hab Sao Geraldo").regiao).toBe("Norte");
  });
});

describe("resolveRegion — fuzzy (erros de digitação)", () => {
  it("Barrinho → Bairrinho → Leste (media, fuzzy)", () => {
    const r = resolveRegion("Barrinho");
    expect(r.regiao).toBe("Leste");
    expect(r.method).toBe("fuzzy");
    expect(r.confidence).toBe("media");
  });

  it("Jardim Satelitte (typo) → Sul", () => {
    expect(resolveRegion("Jardim Satelitte").regiao).toBe("Sul");
  });

  it("palavra bem diferente não casa por fuzzy → indefinida", () => {
    expect(resolveRegion("Tinga").regiao).toBeNull();
  });
});
