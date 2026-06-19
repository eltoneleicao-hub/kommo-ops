import { describe, it, expect } from "vitest";
import { wrapName, renderLabelZPL } from "./zpl-printer";

describe("wrapName", () => {
  it("nome curto fica em 1 linha", () => {
    expect(wrapName("Maria Silva", 26, 2)).toEqual(["Maria Silva"]);
  });

  it("nome longo quebra em 2 linhas por palavra (sem cortar)", () => {
    expect(wrapName("MARIA DE JESUS LOPES DOS SANTOS MOURA", 26, 2)).toEqual([
      "MARIA DE JESUS LOPES DOS",
      "SANTOS MOURA",
    ]);
  });

  it("nome no limite continua em 1 linha", () => {
    const n = "ANA BEATRIZ DE SOUZA LIMA"; // 25 chars
    expect(wrapName(n, 26, 2)).toEqual([n]);
  });

  it("nome gigante trunca a última linha com '...' e respeita o limite", () => {
    const r = wrapName(
      "ANA BEATRIZ CAROLINA FERNANDA GABRIELA HELOISA ISABELA JULIANA",
      26,
      2,
    );
    expect(r.length).toBe(2);
    expect(r[1].endsWith("...")).toBe(true);
    r.forEach((ln) => expect(ln.length).toBeLessThanOrEqual(26));
  });

  it("palavra única maior que o limite é cortada", () => {
    const r = wrapName("ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJ", 26, 2);
    r.forEach((ln) => expect(ln.length).toBeLessThanOrEqual(26));
  });
});

describe("renderLabelZPL — nome longo", () => {
  it("gera duas linhas ^FD para o nome quando ele é longo", () => {
    const zpl = renderLabelZPL({
      recipientName: "Maria de Jesus Lopes dos Santos Moura",
      street: "Rua A",
      number: "1",
      neighborhood: "Centro",
      postalCode: "12200000",
      city: "Sao Jose dos Campos",
      internalOrderNotes: "Centro",
      recipientPhone: "12999990000",
    });
    expect(zpl).toContain("^FDMARIA DE JESUS LOPES DOS^FS");
    expect(zpl).toContain("^FDSANTOS MOURA^FS");
  });
});

describe("renderLabelZPL — balde 'Outras' (fora de SJC) mostra a CIDADE, nunca 'REGIAO: OUTRAS'", () => {
  it("usa o campo Cidade quando preenchido", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Rua X", number: "10",
      neighborhood: "Centro", city: "Jacarei", postalCode: "12300000",
      internalOrderNotes: "Outras", recipientPhone: "",
    });
    expect(zpl).toContain("^FDJACAREI^FS");
    expect(zpl).not.toContain("OUTRAS");
  });

  it("extrai a cidade do endereço em texto livre quando não há campo Cidade", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana",
      street: "Rua das Flores 100, Centro, Cacapava - SP",
      internalOrderNotes: "Outras", recipientPhone: "",
    });
    expect(zpl).toContain("CACAPAVA");
    expect(zpl).not.toContain("OUTRAS");
  });

  it("cai para 'FORA DE SJC' quando a cidade é desconhecida", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Travessa Sem Nome 1",
      internalOrderNotes: "Outras", recipientPhone: "",
    });
    expect(zpl).toContain("FORA DE SJC");
    expect(zpl).not.toContain("OUTRAS");
  });

  it("região normal de SJC continua imprimindo 'REGIAO: X'", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Rua X", number: "1",
      neighborhood: "Centro", city: "SJC", postalCode: "12200000",
      internalOrderNotes: "Leste", recipientPhone: "",
    });
    expect(zpl).toContain("^FDREGIAO: LESTE^FS");
  });
});

describe("renderLabelZPL — campos longos quebram (não só o nome)", () => {
  it("rua/bairro longos quebram em 2 linhas em vez de cortar na borda", () => {
    const zpl = renderLabelZPL({
      recipientName: "Joao",
      street: "Avenida Doutor Joao Guilhermino dos Santos Pereira Filho",
      number: "1234",
      neighborhood: "Jardim Sao Dimas Residencial das Palmeiras Imperiais",
      postalCode: "12245000",
      city: "Sao Jose dos Campos",
      internalOrderNotes: "Centro",
      recipientPhone: "12999990000",
    });
    // cada ^FD deve caber no limite da fonte 28 (~37 chars), provando a quebra
    const fds = [...zpl.matchAll(/\^FD(.*?)\^FS/g)].map((m) => m[1]);
    fds.forEach((t) => expect(t.length).toBeLessThanOrEqual(40));
    // rua quebrou: a 2ª parte aparece numa linha própria
    expect(fds.some((t) => t.includes("AVENIDA DOUTOR JOAO"))).toBe(true);
  });

  it("translitera acentos/mojibake para ASCII na etiqueta inteira", () => {
    const zpl = renderLabelZPL({
      recipientName: "Lindóia Conceição", // acentos corretos
      street: "Rua São João",
      number: "10",
      neighborhood: "Jardim Aquário",
      postalCode: "12200000",
      city: "SÃ£o JosÃ©", // mojibake
      internalOrderNotes: "Sudeste",
      recipientPhone: "12999990000",
    });
    const body = zpl.replace(/\^CI28/g, ""); // ^CI28 é o único token; resto deve ser ASCII
    expect([...body].every((c) => c.charCodeAt(0) <= 0x7f)).toBe(true);
    expect(zpl).toContain("LINDOIA CONCEICAO");
    expect(zpl).toContain("SAO JOSE");
  });

  it("não duplica 'REGIAO' quando o campo já vem como 'Região Sul'", () => {
    const zpl = renderLabelZPL({
      recipientName: "Fulano", street: "Rua A", number: "1",
      neighborhood: "Centro", postalCode: "12200000", city: "SJC",
      internalOrderNotes: "Região Sul", recipientPhone: "",
    });
    expect(zpl).toContain("^FDREGIAO: SUL^FS");
    expect(zpl).not.toContain("REGIAO: REGIAO");
  });

  it("endereço em bloco de texto livre: achata e NÃO perde o bairro", () => {
    // bloco inteiro no campo street, campos discretos vazios (lead típico do Kommo)
    const zpl = renderLabelZPL({
      recipientName: "Maria",
      street: "Rua icatu 330 apto 82C\nCEP 12235649\nPq industrial\nSão José dos Campos",
      internalOrderNotes: "Sul", recipientPhone: "",
    });
    expect(zpl).toContain("PQ INDUSTRIAL");     // bairro preservado inline
    const fds = [...zpl.matchAll(/\^FD([^]*?)\^FS/g)].map((m) => m[1]);
    expect(fds.every((t) => !t.includes("\n"))).toBe(true); // sem quebra crua no campo
    expect(zpl).not.toMatch(/\^FD\s*,/);         // sem linha começando com vírgula órfã
  });
});

describe("renderLabelZPL — robustez (anti-quebra ZPL e anti-misroute)", () => {
  it("neutraliza ^ e ~ no texto (lead não injeta comando ZPL)", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana ^FO~JK Maria", street: "Rua A", number: "1",
      neighborhood: "Centro", city: "SJC", postalCode: "12200000",
      internalOrderNotes: "Sul", recipientPhone: "",
    });
    const fds = [...zpl.matchAll(/\^FD([^]*?)\^FS/g)].map((m) => m[1]);
    fds.forEach((t) => {
      expect(t.includes("^")).toBe(false);
      expect(t.includes("~")).toBe(false);
    });
    expect(zpl).toContain("ANA FO JK MARIA");
  });

  it("anti-misroute: região é zona de SJC mas cidade é de fora → mostra a cidade", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Rua X", number: "10",
      neighborhood: "Centro", city: "Cacapava", postalCode: "12280000",
      internalOrderNotes: "Sul", recipientPhone: "",
    });
    expect(zpl).toContain("CACAPAVA");
    expect(zpl).not.toContain("REGIAO: SUL");
  });

  it("cidade de SJC mantém a região normal (não dispara o guarda)", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Rua X", number: "10",
      neighborhood: "Centro", city: "Sao Jose dos Campos", postalCode: "12200000",
      internalOrderNotes: "Sul", recipientPhone: "",
    });
    expect(zpl).toContain("REGIAO: SUL");
  });
});

describe("renderLabelZPL — CEP normalizado", () => {
  it("formata CEP de 8 dígitos como 00000-000", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Rua X", number: "1", neighborhood: "Centro",
      city: "SJC", postalCode: "12200000", internalOrderNotes: "Sul", recipientPhone: "",
    });
    expect(zpl).toContain("12200-000");
  });

  it("limpa pontuação do CEP e formata quando dá 8 dígitos", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Rua X", number: "1", neighborhood: "Centro",
      city: "SJC", postalCode: "12235.649", internalOrderNotes: "Sul", recipientPhone: "",
    });
    expect(zpl).toContain("12235-649");
    expect(zpl).not.toContain("12235.649");
  });

  it("CEP malformado (≠8 díg.) imprime só os dígitos, sem lixo", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Rua X", number: "1", neighborhood: "Centro",
      city: "SJC", postalCode: "12235.62", internalOrderNotes: "Sul", recipientPhone: "",
    });
    expect(zpl).toContain("1223562");
    expect(zpl).not.toContain("12235.62");
  });
});

describe("renderLabelZPL — região auto-resolvida (lead sem o campo Região)", () => {
  it("resolve do bairro e imprime REGIAO: X sem o campo preenchido", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana", street: "Rua X", number: "1",
      neighborhood: "Bosque dos Eucaliptos", postalCode: "12233690",
      city: "Sao Jose dos Campos", internalOrderNotes: "", recipientPhone: "",
    });
    expect(zpl).toContain("REGIAO: SUL");
  });
});

describe("renderLabelZPL — campo Rua que não é endereço", () => {
  it("frase no campo Rua não vira linha de logradouro na etiqueta", () => {
    const zpl = renderLabelZPL({
      recipientName: "Ana",
      street: "Confio plenamente na competencia, nao e necessario sua visita.",
      neighborhood: "Centro", city: "SJC", postalCode: "12200000",
      internalOrderNotes: "Sul", recipientPhone: "",
    });
    expect(zpl).not.toContain("CONFIO");
    expect(zpl).toContain("REGIAO: SUL");
  });
});
