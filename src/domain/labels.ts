import { parseAddressField } from "./address-parser";

export type LabelInput = {
  recipientName?: string | null;
  recipientPhone?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  postalCode?: string | null;
  city?: string | null;
  complement?: string | null;
  internalOrderNotes?: string | null;
};

const requiredFields: Array<[keyof LabelInput, string]> = [
  ["recipientName", "nome do destinatario"],
  ["recipientPhone", "telefone"],
  ["street", "Rua/Avenida"],
  ["number", "Numero"],
  ["neighborhood", "Bairro"],
  ["postalCode", "CEP"],
  ["city", "Cidade"],
  ["internalOrderNotes", "Região"],
];

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

/**
 * Normaliza endereço fazendo parse de campos combinados em um único field
 * Exemplo: "Rua X, 123, CEP 12345-678, Bairro Y" no campo street
 */
export function normalizeAddressInput(input: LabelInput): LabelInput {
  // Se street está preenchido mas número está vazio, tenta fazer parse
  if (clean(input.street) && !clean(input.number)) {
    const parsed = parseAddressField(clean(input.street), {
      number: input.number,
      postalCode: input.postalCode,
      neighborhood: input.neighborhood,
      complement: input.complement,
      city: input.city,
    });

    // Usa campos parseados se não estavam preenchidos
    return {
      ...input,
      street: parsed.street || input.street,
      number: parsed.number || input.number,
      neighborhood: parsed.neighborhood || input.neighborhood,
      postalCode: parsed.postalCode || input.postalCode,
      city: parsed.city || input.city,
      complement: parsed.complement || input.complement,
    };
  }

  return input;
}

export function validateLabelInput(input: LabelInput): string[] {
  // Primeiro normaliza o endereço
  const normalized = normalizeAddressInput(input);

  return requiredFields
    .filter(([key]) => clean(normalized[key]).length === 0)
    .map(([, label]) => label);
}

export function renderLabelText(input: LabelInput): string {
  // Normaliza endereço antes de renderizar (fallback para campos combinados)
  const normalized = normalizeAddressInput(input);

  const lines = [
    clean(normalized.recipientName).toUpperCase(),
    "",
    `${clean(normalized.street)}, ${clean(normalized.number)}`,
  ];

  const complement = clean(normalized.complement);
  if (complement) {
    lines.push(complement);
  }

  lines.push(
    clean(normalized.neighborhood),
    `${clean(normalized.city)} - CEP ${clean(normalized.postalCode)}`,
    "",
    `Telefone: ${clean(normalized.recipientPhone)}`,
    "",
    `REGIAO: ${clean(normalized.internalOrderNotes)}`,
  );

  return lines.join("\n");
}
