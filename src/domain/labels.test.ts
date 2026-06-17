import { describe, expect, it } from "vitest";
import { renderLabelText, validateLabelInput } from "./labels";

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
