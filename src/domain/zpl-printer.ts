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

  const X = 130;         // margem esquerda (dots) — afasta da borda p/ não cortar
  const LABEL_H = 406;   // altura útil da etiqueta (dots)

  // Monta as linhas (texto + altura + respiro) antes de posicionar, para
  // calcular a altura total e CENTRALIZAR o bloco verticalmente.
  type Line = { text: string; h: number; gap: number };
  const lines: Line[] = [];
  lines.push({ text: recipientName, h: 40, gap: 12 });   // destinatário (destaque)
  lines.push({ text: `${street}, ${number}`, h: 28, gap: 8 });
  if (complement) lines.push({ text: complement, h: 26, gap: 8 });
  lines.push({ text: neighborhood, h: 28, gap: 8 });
  lines.push({ text: `${city} - ${postalCode}`, h: 28, gap: 8 });
  lines.push({ text: `TEL: ${recipientPhone}`, h: 28, gap: 8 });
  lines.push({ text: `REGIAO: ${internalOrderNotes}`, h: 22, gap: 0 }); // discreto

  const totalH = lines.reduce((sum, l) => sum + l.h + l.gap, 0);
  // Y inicial centraliza o bloco; nunca sobe acima de 12 dots.
  let y = Math.max(12, Math.round((LABEL_H - totalH) / 2));

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

  for (const line of lines) {
    cmds.push(`^FO${X},${y}`, `^A0N,${line.h},${line.h}`, `^FD${line.text}^FS`);
    y += line.h + line.gap;
  }

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
