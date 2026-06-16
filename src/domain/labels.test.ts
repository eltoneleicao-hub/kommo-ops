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

  it("returns missing fields in Portuguese labels", () => {
    expect(validateLabelInput({ ...completeInput, street: "", recipientPhone: "" })).toEqual([
      "telefone",
      "Rua/Avenida",
    ]);
  });

  it("renders label without sender and without empty complement", () => {
    expect(renderLabelText(completeInput)).toBe(
      [
        "MARIA SILVA",
        "",
        "Rua Manoel Fiel Filho, 204",
        "Bosque dos eucaliptos",
        "Sao Jose dos Campos - CEP 12233690",
        "",
        "Telefone: 12999990000",
        "",
        "REGIAO: REGIAO LESTE",
      ].join("\n"),
    );
  });
});
