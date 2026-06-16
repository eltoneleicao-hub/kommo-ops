# Como usar o address-parser

## O problema que ele resolve

O campo **Rua/Avenida** do Kommo às vezes chega com vários componentes
misturados num único texto:

```
"Rua Manoel Fiel Filho, 204, CEP 12233-690, Bosque dos eucaliptos"
"Av. Paulista, 1000 - Bela Vista - 01310-100"
"Rua X - nº 100 - Bairro Z - 98765-432"
```

O parser extrai cada componente sem perder dados e retorna um score de
confiança para facilitar o log e o debug.

---

## API

```ts
import { parseAddressField } from "@/domain/address-parser";
import type { ParsedAddress, OtherAddressFields } from "@/domain/address-parser";

const result: ParsedAddress = parseAddressField(streetField, otherFields);
```

### Parâmetros

| Parâmetro     | Tipo                  | Descrição                                  |
|---------------|-----------------------|--------------------------------------------|
| `streetField` | `string`              | Valor bruto do campo Rua/Avenida do Kommo  |
| `otherFields` | `OtherAddressFields`  | Demais campos do formulário (podem ser `""` ou `null`) |

`OtherAddressFields`:
```ts
{
  number?:       string | null;
  postalCode?:   string | null;
  neighborhood?: string | null;
  complement?:   string | null;
}
```

### Retorno — `ParsedAddress`

```ts
{
  street:          string;   // logradouro limpo
  number:          string;   // número do imóvel
  neighborhood:    string;   // bairro
  postalCode:      string;   // CEP sem traço ("12233690")
  complement:      string;   // complemento ou segmento residual
  confidence:      "high" | "medium" | "low";
  rawStreet:       string;   // texto original recebido
  parsedFallback:  string[]; // campos que ficaram vazios (para log)
}
```

**Campos externos têm prioridade** sobre o que foi extraído do `streetField`.
Se `otherFields.number = "55"` e o texto também contém `", 100"`, o resultado
será `"55"`.

### Score de confiança

| Valor    | Significado                                          |
|----------|------------------------------------------------------|
| `high`   | Todos os campos foram extraídos com sucesso          |
| `medium` | Um campo ficou vazio (geralmente CEP ou número)      |
| `low`    | Dois ou mais campos ficaram vazios                   |

Quando `confidence` não é `"high"`, o parser emite um `console.warn` com
os campos em `parsedFallback` e o texto original — útil para auditar
endereços problemáticos nos logs do servidor.

---

## Integração em labels.ts

O local natural é **antes** de chamar `renderLabelText`. Exemplo mínimo:

```ts
// src/app/api/kommo/requests/route.ts (ou onde você monta o LabelInput)

import { parseAddressField } from "@/domain/address-parser";

// --- valores brutos vindos do webhook/API Kommo ---
const rawStreet      = lead.custom_fields["Rua/Avenida"] ?? "";
const rawNumber      = lead.custom_fields["Numero"] ?? "";
const rawNeighborhood = lead.custom_fields["Bairro"] ?? "";
const rawPostalCode  = lead.custom_fields["CEP"] ?? "";
const rawComplement  = lead.custom_fields["Complemento"] ?? "";

// --- parse ---
const addr = parseAddressField(rawStreet, {
  number:       rawNumber,
  neighborhood: rawNeighborhood,
  postalCode:   rawPostalCode,
  complement:   rawComplement,
});

// --- monta o LabelInput ---
const labelInput: LabelInput = {
  recipientName:      lead.name,
  recipientPhone:     lead.custom_fields["Telefone"],
  street:             addr.street,
  number:             addr.number,
  neighborhood:       addr.neighborhood,
  postalCode:         addr.postalCode,
  complement:         addr.complement,
  city:               lead.custom_fields["Cidade"] ?? "",
  internalOrderNotes: lead.custom_fields["Anotacoes internas do pedido"] ?? "",
};
```

Se quiser guardar o score para analytics futuros, adicione ao modelo do
Prisma ou a um campo de metadados:

```ts
// Exemplo: salvar junto ao Request no banco
await prisma.request.update({
  where: { id },
  data: {
    addressConfidence: addr.confidence,   // "high" | "medium" | "low"
    addressFallback:   addr.parsedFallback.join(","), // "neighborhood,postalCode"
  },
});
```

---

## Integração em requests.ts

Nenhuma mudança estrutural necessária. `requests.ts` já determina o status
pelo conjunto de campos faltando via `validateLabelInput`. Como o parser
preenche os campos antes de validar, o fluxo natural já funciona.

Se quiser exibir um aviso extra na UI para endereços com confiança `"low"`:

```ts
import { getRequestStatusForMissingFields } from "@/domain/requests";

const missing = validateLabelInput(labelInput);
const status  = getRequestStatusForMissingFields(missing);

// status extra só para o front-end, não persiste no banco
const addressWarning = addr.confidence === "low"
  ? `Endereço incompleto: ${addr.parsedFallback.join(", ")}`
  : null;
```

---

## Padrões reconhecidos

| Exemplo de entrada                                              | Detecta              |
|-----------------------------------------------------------------|----------------------|
| `"Rua X, 123, CEP 12345-678, Bairro Y"`                        | tudo                 |
| `"Rua X, 123 - Bairro Y"`                                       | logradouro + nº + bairro |
| `"Rua X - nº 100 - Bairro Z - 98765-432"`                      | tudo via hífen       |
| `"Rua X, 10A, Centro, 01013-001"`                              | nº com letra         |
| `"Rua X, 123"`                                                  | logradouro + nº (confidence=low) |
| Campo limpo + campos externos preenchidos                       | usa campos externos  |
| Lixo / campo vazio                                              | retorna o máximo possível (confidence=low) |

CEP é normalizado sem traço (`"12233-690"` → `"12233690"`) independente do
formato de entrada.

---

## Rodar os testes

```bash
npm test
# ou em modo watch:
npm run test:watch
```

Os testes do parser ficam em `src/domain/address-parser.test.ts`.
