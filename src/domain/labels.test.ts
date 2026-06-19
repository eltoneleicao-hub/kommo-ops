import { describe, expect, it } from "vitest";
import { effectiveRegion, normalizeAddressInput, renderLabelText, validateLabelInput, labelDedupeKey } from "./labels";
import { resolveRegion } from "./region-resolver";

describe("labelDedupeKey", () => {
  const base = { recipientName: "Maria Silva", street: "Rua A, 100", neighborhood: "Centro", postalCode: "12200000", city: "SJC" };
  it("mesma info (formatação/acento diferente) → mesma chave", () => {
    const a = labelDedupeKey({ recipientName: "MARÍA SÍLVA", street: "Rua A 100", neighborhood: "centro", postalCode: "12200-000", city: "sjc" });
    const b = labelDedupeKey(base);
    expect(a).toBe(b);
    expect(a).not.toBe("");
  });
  it("nome ou endereço diferente → chave diferente", () => {
    expect(labelDedupeKey({ ...base, recipientName: "Joao Souza" })).not.toBe(labelDedupeKey(base));
    expect(labelDedupeKey({ ...base, street: "Rua B, 200" })).not.toBe(labelDedupeKey(base));
  });
  it("sem nome ou sem endereço → chave vazia (não deduplica)", () => {
    expect(labelDedupeKey({ recipientName: "", street: "Rua A" })).toBe("");
    expect(labelDedupeKey({ recipientName: "Maria", street: "" })).toBe("");
  });
});

const completeInput = {
  recipientName: "Maria Silva",
  recipientPhone: "12999990000",
  street: "Rua Manoel Fiel Filho",
  number: "204",
  neighborhood: "Bosque dos eucaliptos",
  postalCode: "12233690",
  city: "Sao Jose dos Campos",
  complement: "",
  internalOrderNotes: "REGIAO SUL", // Bosque dos Eucaliptos é Sul (fixture consistente)
};

describe("label domain", () => {
  it("validates required fields and ignores empty complement", () => {
    expect(validateLabelInput(completeInput)).toEqual([]);
  });

  it("telefone vazio NÃO é mais campo faltando; demais vêm em pt-BR", () => {
    expect(validateLabelInput({ ...completeInput, street: "", recipientPhone: "" })).toEqual([
      "Rua/Avenida",
    ]);
  });

  it("região vazia mas bairro resolvível → elegível (auto-resolve, sem editar Kommo)", () => {
    expect(validateLabelInput({
      ...completeInput, internalOrderNotes: "",
      neighborhood: "Bosque dos Eucaliptos", postalCode: "12233690",
    })).toEqual([]);
  });

  it("região vazia e nada resolvível → falta Região", () => {
    expect(validateLabelInput({
      recipientName: "Ana", street: "Rua X", number: "1",
      neighborhood: "", postalCode: "", city: "", internalOrderNotes: "",
    })).toEqual(["Região"]);
  });

  it("frase no campo Rua (não é endereço) → falta Rua/Avenida", () => {
    expect(validateLabelInput({
      recipientName: "Ana",
      street: "Confio plenamente na competencia como medico, nao e necessario sua visita.",
      internalOrderNotes: "Sul",
    })).toContain("Rua/Avenida");
  });

  it("'Não' / 'Ok' / pontuação no campo Rua não contam como endereço", () => {
    for (const junk of ["Não", "Ok", ",", "A"]) {
      expect(
        validateLabelInput({ recipientName: "Ana", street: junk, internalOrderNotes: "Sul" }),
      ).toContain("Rua/Avenida");
    }
  });

  it("endereço real sem a palavra 'rua' (tem número) continua elegível", () => {
    expect(validateLabelInput({
      recipientName: "Ana", street: "Beira Rio 45", neighborhood: "Urbanova",
      postalCode: "12244000", internalOrderNotes: "Oeste",
    })).toEqual([]);
  });

  it("abreviação de via ('Estr.') é reconhecida como endereço (não flag)", () => {
    expect(validateLabelInput({
      recipientName: "Ana", street: "Estr. Dom José Antônio do Couto",
      neighborhood: "Sao Francisco Xavier", internalOrderNotes: "Norte",
    })).toEqual([]);
  });

  it("conflito (c): bairro exato + CEP discordam do SELECT → corrige p/ o bairro", () => {
    // SELECT diz Leste; bairro "Bosque dos Eucaliptos" (Sul, exato) e CEP 12233 (Sul)
    expect(effectiveRegion({
      recipientName: "Ana", street: "Rua X", neighborhood: "Bosque dos Eucaliptos",
      postalCode: "12233690", internalOrderNotes: "Leste",
    })).toBe("Sul");
  });

  it("conflito (c): se o CEP apoia o SELECT, mantém o SELECT (empate técnico)", () => {
    // bairro "Jardim Satélite" resolve Sul (exato), mas CEP 12200 é Centro = SELECT
    expect(effectiveRegion({
      recipientName: "Ana", street: "Rua X", neighborhood: "Jardim Satélite",
      postalCode: "12200000", internalOrderNotes: "Centro",
    })).toBe("Centro");
  });

  it("sem conflito: bairro concorda com o SELECT → mantém", () => {
    expect(effectiveRegion({
      recipientName: "Ana", street: "Rua X", neighborhood: "Bosque dos Eucaliptos",
      postalCode: "12233690", internalOrderNotes: "Sul",
    })).toBe("Sul");
  });

  it("bloco Origem/Destino: resolve região pelo DESTINO (Floresta=Leste), não pela Origem (Jardim América=Sul)", () => {
    const block = [
      "Origem:", "Rua Java, 174", "Ap 145", "Jardim América", "",
      "Destino:",
      "Rua: Ana Benedita de Miranda n° 75 - Casa",
      "Bairro: Floresta - São Jose dos campos",
      "Condomínio: Reserva Aruana",
      "CEP: 12226 -357",
    ].join("\n");
    const norm = normalizeAddressInput({ street: block });
    expect(norm.neighborhood).toBe("Floresta"); // Destino, não "Jardim América"
    expect(resolveRegion(norm.neighborhood, norm.postalCode).regiao).toBe("Leste");
  });

  it("renders label sem telefone e sem complemento vazio", () => {
    expect(renderLabelText(completeInput)).toBe(
      [
        "MARIA SILVA",
        "",
        "Rua Manoel Fiel Filho, 204",
        "Bosque dos eucaliptos",
        "Sao Jose dos Campos - CEP 12233690",
        "",
        "REGIAO: SUL",
      ].join("\n"),
    );
  });

  it("região auto-resolvida (campo Kommo vazio) IMPRIME na etiqueta", () => {
    const out = renderLabelText({
      recipientName: "Ana", street: "Rua Manoel Fiel Filho", number: "204",
      neighborhood: "Bosque dos Eucaliptos", postalCode: "12233690",
      city: "Sao Jose dos Campos", internalOrderNotes: "",
    });
    expect(out).toContain("REGIAO: Sul");
    expect(out).not.toMatch(/REGIAO:\s*$/m); // nunca em branco quando elegível
  });

  it("balde 'Outras': renderLabelText mostra a cidade no lugar de 'REGIAO: OUTRAS'", () => {
    const out = renderLabelText({
      recipientName: "Ana", street: "Rua X", number: "10",
      neighborhood: "Centro", city: "Jacarei", postalCode: "12300000",
      internalOrderNotes: "Outras",
    });
    expect(out).toContain("JACAREI");
    expect(out).not.toMatch(/REGIAO:\s*OUTRAS/i);
  });
});
