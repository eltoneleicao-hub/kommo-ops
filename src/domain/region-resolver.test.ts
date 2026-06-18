import { describe, it, expect } from "vitest";
import { resolveRegion, resolveRegionFromText, normalizeBairro } from "./region-resolver";

describe("resolveRegionFromText — endereço livre (campo Rua/Avenida)", () => {
  it("resolve bairro de SJC mesmo grudado com CEP/cidade", () => {
    expect(resolveRegionFromText("Rua icatu 330 | CEP 12235649 | Pq industrial | São José dos Campos").regiao).toBe("Sul");
    expect(resolveRegionFromText("Rua José Lopes 268 | 12244885 | Urbanova | SJC").regiao).toBe("Oeste");
    expect(resolveRegionFromText("Rua Edward Simões 403 | 12220530 | Vila Industrial | São José dos Campos").regiao).toBe("Leste");
    expect(resolveRegionFromText("Rua Manoel Meneses Leal. 416, Galo Branco SJCAMPOS").regiao).toBe("Leste");
  });

  it("SEGURANÇA: endereço de outra cidade NUNCA vira região de SJC", () => {
    const foraDeSJC = [
      "Rua/Av: X | Bairro: JARDIM GARCEZ | Cidade: TAUBATÉ",
      "Bairro Maria Elmira,Caçapava ,SP | Cep 12285020",
      "Rua Dom José 1 n 78 | 12310-047 | Pq dos Príncipes | Jacareí - SP",
      "Rua Raul Pompéia 1100 apto 101, cep 05025-011, São Paulo",
      "Av Corinthians 531 casa CEP 11689-410 bairro estufa 2 Ubatuba SP",
      "Rua Sebastião Vitalino 83 | Parque Califórnia | Jacareí/Sp | 12.311230",
    ];
    foraDeSJC.forEach((e) => expect(resolveRegionFromText(e).regiao).toBeNull());
  });

  it("texto vazio / sem bairro → null", () => {
    expect(resolveRegionFromText("").regiao).toBeNull();
    expect(resolveRegionFromText("estrada municipal numero 40").regiao).toBeNull();
  });
});

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

describe("resolveRegion — aliases verificados (variantes que caíam em manual)", () => {
  const casos: Array<[string, string]> = [
    ["Betania", "Centro"],
    ["Oswaldo Cruz", "Centro"],
    ["Altos de santana", "Norte"],
    ["Jardim Telespark", "Norte"],
    ["Jd MG", "Norte"],
    ["Jardim San Marino", "Sul"],
    ["Jardim Sam Marino", "Sul"],
    ["Jd San Marino", "Sul"],
    ["31 de março", "Sul"],
    ["Trinta e um de março", "Sul"],
    ["Palmeiras", "Sul"],
    ["Oriente", "Sul"],
    ["Residencial União", "Sul"],
    ["Residencial união", "Sul"],
    ["Terras do sul", "Sul"],
    ["Residencial Sol Nascente", "Sul"],
    ["Independencia", "Sul"],
    ["Vale do Sol", "Sul"],
    ["Jardim Morumbi", "Sul"],
    ["Pq Industrial Sjc", "Sul"],
    ["Nova Michigan", "Leste"],
    ["Galo Branco", "Leste"],
    ["JD Paineiras lI", "Leste"],
    ["Set Ville", "Leste"],
    ["Novo Horizonte", "Leste"],
    ["Residencial Mantiqueira", "Leste"],
    ["CTA", "Sudeste"],
    ["Campus do CTA", "Sudeste"],
    ["Santa Julia", "Sudeste"],
    ["São Judas Tadeu", "Sudeste"],
    ["J das industria", "Oeste"],
  ];
  casos.forEach(([entrada, regiao]) => {
    it(`"${entrada}" → ${regiao} (gravável: alta/media)`, () => {
      const r = resolveRegion(entrada);
      expect(r.regiao).toBe(regiao);
      // precisa ser gravável no lote (o widget só grava alta/media, não baixa)
      expect(r.confidence === "alta" || r.confidence === "media").toBe(true);
    });
  });
});

describe("resolveRegion — núcleo do nome (prefixo genérico omitido)", () => {
  const casos: Array<[string, string]> = [
    ["Satélite", "Sul"],          // Jardim Satélite
    ["Aquarius", "Oeste"],        // Parque/Residencial ... Aquarius
    ["Topázio", "Centro"],        // Jardim Topázio (núcleo único)
    ["Bela Vista", "Centro"],     // Jardim Bela Vista
    ["Bosque dos Eucaliptos", "Sul"],
  ];
  casos.forEach(([entrada, regiao]) => {
    it(`"${entrada}" → ${regiao}`, () => {
      const r = resolveRegion(entrada);
      expect(r.regiao).toBe(regiao);
      expect(r.confidence === "alta" || r.confidence === "media").toBe(true);
    });
  });
});

describe("resolveRegion — typo, dica de zona e bairro embutido", () => {
  it('"Palmeiras Soa jose" (typo São) → Sul', () => {
    expect(resolveRegion("Palmeiras Soa jose").regiao).toBe("Sul");
  });
  it('dica "...Zona Norte" → Norte', () => {
    const r = resolveRegion("Condomínio Radici- Igreja da Cidade Zona Norte, deixar portaria");
    expect(r.regiao).toBe("Norte");
  });
  it('bairro embutido "...Jardim das Industrias" → Oeste', () => {
    expect(resolveRegion("Condomínio esplendor blue- Jardim das Industrias").regiao).toBe("Oeste");
  });
  it('bairro embutido "Empresa: Bosque dos Eucaliptos /Casa Jardim Imperial" → Sul', () => {
    expect(resolveRegion("Empresa: Bosque dos Eucaliptos /Casa Jardim Imperial").regiao).toBe("Sul");
  });
  it('embutido conservador: "Rua Santa Rita 10" → null (não chuta)', () => {
    expect(resolveRegion("Rua Santa Rita 10").regiao).toBeNull();
  });
  it('"Residencial Terras do vale" (Caçapava) → null (não confunde c/ Terras do Sul)', () => {
    expect(resolveRegion("Residencial Terras do vale").regiao).toBeNull();
  });
});

describe("resolveRegion — correspondência pela lista oficial (PDF)", () => {
  // Bairro escrito ≠ entrada exata, mas com correspondência ÚNICA na lista
  // oficial → confiamos na lista (decisão do usuário: PDF é a fonte oficial).
  const casos: Array<[string, string]> = [
    ["Floresta", "Leste"],          // Condomínio Floresta
    ["Loteamento Floresta", "Leste"],
    ["Jardim São Pedro", "Centro"], // Vila São Pedro
    ["Parque Planalto", "Leste"],   // Conj. Res. Planalto
    ["Jardim Iracema", "Sudeste"],  // Vila Iracema
  ];
  casos.forEach(([entrada, regiao]) => {
    it(`"${entrada}" → ${regiao}`, () => {
      expect(resolveRegion(entrada).regiao).toBe(regiao);
    });
  });
});

describe("resolveRegion — SEGURANÇA: colisão cidade/2-regiões fica null", () => {
  // Capitais homônimas e núcleos em 2 regiões na lista oficial: NUNCA chutar.
  ["Parque Imperial", "São Paulo", "Industrial", "Nova Esperança"].forEach((b) => {
    it(`"${b}" → null (ambíguo/colisão)`, () => {
      expect(resolveRegion(b).regiao).toBeNull();
    });
  });
});

describe("resolveRegion — fora de SJC / incertos seguem p/ manual (null)", () => {
  // Bairros de OUTRAS cidades NÃO podem virar região de SJC (entrega física).
  ["Mooca", "Vila Branca", "Cidade Salvador", "Quiririm", "Mogilar",
   "Freguesia do Ó", "Cesar de Souza", "Pacaembu", "Jardim Stettel",
   "Jardim Califórnia", "Residencial Terras do Vale", "Mirante do Vale",
   "Jardim Campo Grande", "Vila Pantaleão", "Morada dos Nobres"].forEach((b) => {
    it(`"${b}" → null (revisão manual)`, () => {
      expect(resolveRegion(b).regiao).toBeNull();
    });
  });
});

describe("resolveRegion — endereço em texto livre (campo Rua/Avenida cru)", () => {
  it("acha bairro embutido em SJC e resolve", () => {
    expect(
      resolveRegion("Rua castor número 25 Apt 182 cp12230320 jardim satélite cidade são José dos Campos").regiao,
    ).toBe("Sul");
    expect(
      resolveRegion("Rua Letícia de Moraes Vieira 82 \nCep 12226-360\nCampos de São José \nSão José dos Campos").regiao,
    ).toBe("Leste");
  });

  it("endereço de OUTRA cidade não vira região de SJC (null)", () => {
    expect(resolveRegion("Rua/Av: X\nBairro: JARDIM GARCEZ\nCidade: TAUBATÉ").regiao).toBeNull();
    expect(resolveRegion("cond Belavista\nBairro Maria Elmira,Caçapava ,SP\nCep 12285020").regiao).toBeNull();
    expect(resolveRegion("Rua Dom José 1 n 78\n12310-047 \nPq dos Príncipes \nJacareí - SP").regiao).toBeNull();
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
