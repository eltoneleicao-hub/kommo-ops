/**
 * zpl-printer.ts
 *
 * Gerador de comandos ZPL (Zebra Programming Language) para etiquetas de entrega
 * Zebra ZD220T (203 dpi)
 */

import type { LabelInput } from "./labels";

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

/**
 * Gera comando ZPL para imprimir etiqueta de entrega.
 *
 * Layout:
 * - Todo o texto em MAIÚSCULAS (legibilidade).
 * - Fonte ampliada (nome ~40 dots, corpo ~28 dots).
 * - Margem esquerda (X) afastada da borda para não cortar na impressão.
 * - Linhas posicionadas dinamicamente (cursor Y), então fontes maiores não
 *   sobrepõem nem estouram.
 *
 * Dimensões: 203 dpi (8 dots/mm) · largura 832 dots (104mm) · altura 406 dots.
 */
export function renderLabelZPL(input: LabelInput): string {
  const up = (value: string | null | undefined): string => clean(value).toUpperCase();

  const recipientName = up(input.recipientName);
  const street = up(input.street);
  const number = up(input.number);
  const neighborhood = up(input.neighborhood);
  const city = up(input.city);
  const postalCode = up(input.postalCode);
  const recipientPhone = clean(input.recipientPhone); // só dígitos — sem caixa
  const internalOrderNotes = up(input.internalOrderNotes);
  const complement = up(input.complement);

  const X = 30; // margem esquerda (dots) — afasta da borda p/ não cortar

  const cmds: string[] = [
    "^XA",      // início
    "^CI28",    // encoding UTF-8 (renderiza acentos: SÃO JOSÉ, REGIÃO, etc.)
    "^MMT,Y",   // tear off
    "^MNY",     // auto-detect gaps
    "^PON",     // orientação normal
    "^PW832",   // largura 104mm
    "^LL406",   // altura 50.8mm
    "^LH0,0",   // home offset
  ];

  // Cursor vertical: cada linha avança Y por (altura da fonte + respiro).
  let y = 18;
  const addLine = (text: string, height: number, width: number, gap = 8): void => {
    cmds.push(`^FO${X},${y}`, `^A0N,${height},${width}`, `^FD${text}^FS`);
    y += height + gap;
  };

  // 1. DESTINATÁRIO — maior, destaque
  addLine(recipientName, 40, 40, 12);

  // 2. RUA + NÚMERO
  addLine(`${street}, ${number}`, 28, 28);

  // 3. COMPLEMENTO (se houver)
  if (complement) {
    addLine(complement, 26, 26);
  }

  // 4. BAIRRO
  addLine(neighborhood, 28, 28);

  // 5. CIDADE - CEP
  addLine(`${city} - ${postalCode}`, 28, 28);

  // 6. TELEFONE
  addLine(`TEL: ${recipientPhone}`, 28, 28);

  // 7. REGIÃO — destaque
  addLine(`REGIAO: ${internalOrderNotes}`, 32, 32);

  cmds.push(
    "^PQ1,0,1,Y", // 1 cópia
    "^XZ",        // fim
  );

  return cmds.join("\n");
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
