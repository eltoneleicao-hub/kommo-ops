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
});
