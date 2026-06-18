import { describe, expect, it } from "vitest";
import { normalizeAddressInput, renderLabelText, validateLabelInput, labelDedupeKey } from "./labels";
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
  internalOrderNotes: "REGIAO LESTE",
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
        "REGIAO: REGIAO LESTE",
      ].join("\n"),
    );
  });
});
