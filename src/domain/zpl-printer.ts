/**
 * zpl-printer.ts
 *
 * Gerador de comandos ZPL (Zebra Programming Language) para etiquetas 100x150mm
 * Zebra ZD220T (203 dpi)
 */

import type { LabelInput } from "./labels";

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

/**
 * Gera comando ZPL para imprimir etiqueta de entrega
 *
 * Dimensões:
 * - Papel: 104mm x 50.8mm (Zebra ZD220T padrão)
 * - DPI: 203 (padrão Zebra)
 * - Conversão: 1mm ≈ 8 dots @ 203dpi
 * - Largura: 104mm = 832 dots
 * - Altura: 50.8mm = 406 dots
 */
export function renderLabelZPL(input: LabelInput): string {
  const recipientName = clean(input.recipientName).toUpperCase();
  const street = clean(input.street);
  const number = clean(input.number);
  const neighborhood = clean(input.neighborhood);
  const city = clean(input.city);
  const postalCode = clean(input.postalCode);
  const recipientPhone = clean(input.recipientPhone);
  const internalOrderNotes = clean(input.internalOrderNotes);
  const complement = clean(input.complement);

  const lines = [
    // Header ZPL - Configuracao para etiqueta 104x50.8mm (VERTICAL)
    "^XA", // Start label
    "^MMT,Y", // Media Mode: Tear off (etiqueta única, não contínuo)
    "^MNY", // Media Calibration: Auto-detect gaps
    "^PON", // Print orientation: normal (vertical)
    "^PW832", // Print width: 104mm (832 dots - largura)
    "^LL406", // Label length: 50.8mm (406 dots - altura)
    "^LH0,0", // Label Home offset

    // Margem superior vazia (8 dots)
    "",

    // 1. DESTINATÁRIO (Bold, pequeno)
    "^FO10,8", // X: 10, Y: 8
    "^A0B,24,20", // Font: 0, Bold, Width 24, Height 20
    `^FD${recipientName}^FS`, // Field data + Field separator

    "",

    // 2. ENDEREÇO (Street + Number)
    "^FO10,35", // Próxima linha
    "^A0N,16,16", // Font normal, pequeno
    `^FD${street}, ${number}^FS`,

    "",

    // 3. COMPLEMENTO (se houver)
    ...(complement
      ? [
          "^FO10,55",
          "^A0N,14,14",
          `^FD${complement}^FS`,
          "",
        ]
      : []),

    // 4. BAIRRO
    `^FO10,${complement ? 75 : 55}`,
    "^A0N,14,14",
    `^FD${neighborhood}^FS`,

    "",

    // 5. CIDADE - CEP
    `^FO10,${complement ? 95 : 75}`,
    "^A0N,14,14",
    `^FD${city} - ${postalCode}^FS`,

    "",

    // 6. TELEFONE
    `^FO10,${complement ? 115 : 95}`,
    "^A0N,14,14",
    `^FDTel: ${recipientPhone}^FS`,

    "",

    // 7. REGIÃO (Bold, pequeno)
    `^FO10,${complement ? 135 : 115}`,
    "^A0B,16,14",
    `^FD${internalOrderNotes}^FS`,

    "",

    // Footer: linha divisória (opcional)
    `^FO5,${complement ? 155 : 135}`,
    "^GB820,1,1^FS", // Graphic box: width=820, height=1, border=1

    "",

    // Print Quantity: 1 cópia apenas (força impressora a não repetir)
    "^PQ1,0,1,Y",

    // End label
    "^XZ",
  ];

  return lines.filter((line) => line !== "").join("\n");
}

/**
 * Testa o ZPL gerado usando labelary.com (visualizador online)
 * Retorna URL para preview
 */
export function previewZPLOnline(zplContent: string): string {
  const encoded = encodeURIComponent(zplContent);
  return `https://labelary.com/viewer.html?${encoded}&width=4&height=6`;
}

/**
 * Valida ZPL básico (verifica se tem tags obrigatórias)
 */
export function validateZPL(zplContent: string): boolean {
  return zplContent.includes("^XA") && zplContent.includes("^XZ");
}
