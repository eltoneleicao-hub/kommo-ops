/**
 * zpl-printer.ts
 *
 * Gerador de comandos ZPL (Zebra Programming Language) para etiquetas de entrega
 * Zebra ZD220T (203 dpi)
 */

import type { LabelInput } from "./labels";
import { toAsciiText } from "./encoding";

function clean(value: string | null | undefined): string {
  // Repara mojibake E translitera p/ ASCII (SAO JOSE) — robusto contra qualquer
  // encoding (fonte da Zebra, ^CI28, agente). Etiqueta de entrega não precisa de acento.
  return toAsciiText(value).trim();
}

/**
 * Quebra um nome longo em até `maxLines` linhas de ~`maxChars` caracteres
 * (quebrando por palavra), para não cortar na borda direita da etiqueta.
 * Nome curto volta em 1 linha. Se ainda estourar `maxLines`, trunca a última
 * com "..." (ASCII — a fonte da Zebra pode não ter o glifo "…").
 */
export function wrapName(text: string, maxChars: number, maxLines: number): string[] {
  const t = clean(text);
  if (t.length <= maxChars) return [t];

  const words = t.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) {
      lines.push(cur);
      cur = "";
    }
  };

  for (const w of words) {
    if (lines.length >= maxLines) break;
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= maxChars) {
      cur = cand;
    } else {
      flush();
      cur = w.length <= maxChars ? w : w.slice(0, maxChars); // palavra única gigante: corta
    }
  }
  flush();

  const result = lines.slice(0, maxLines);
  // Sobrou conteúdo além das linhas permitidas → reticência na última.
  if (result.length && result.join(" ").length < t.length) {
    const i = result.length - 1;
    const cut = Math.max(0, maxChars - 3);
    const base = result[i].length > cut ? result[i].slice(0, cut).trimEnd() : result[i];
    result[i] = `${base}...`;
  }
  return result;
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
  const internalOrderNotes = up(input.internalOrderNotes);
  const complement = up(input.complement);

  const X = 130;         // margem esquerda (dots) — afasta da borda p/ não cortar
  const LABEL_H = 406;   // altura útil da etiqueta (dots)

  // Monta as linhas (texto + altura + respiro) antes de posicionar, para
  // calcular a altura total e CENTRALIZAR o bloco verticalmente.
  type Line = { text: string; h: number; gap: number };
  const lines: Line[] = [];

  // Largura útil ≈ 702 dots (PW832 − X − margem direita). O nome calibrou em
  // 26 chars @ fonte 40 (~27 dots/char); o limite escala inversamente c/ a fonte.
  const AVAIL = 702;
  const maxChars = (h: number) => Math.max(8, Math.floor(AVAIL / (h * 0.675)));

  // Empurra um campo aplicando a MESMA regra de quebra do nome a TODOS: parte em
  // até `maxLines` linhas (coladas, gap 4) e dá o respiro `gap` só após a última.
  const pushField = (text: string, h: number, gap: number, maxLines = 2) => {
    wrapName(text, maxChars(h), maxLines).forEach((ln, i, arr) => {
      lines.push({ text: ln, h, gap: i === arr.length - 1 ? gap : 4 });
    });
  };

  // Achata blocos de endereço (quebras de linha / "|" viram ", ") e colapsa
  // vírgulas repetidas — muitos leads trazem TODO o endereço no campo Rua/Avenida.
  const flat = (s: string) =>
    s.replace(/[\r\n|]+/g, ", ")
      .replace(/\s+/g, " ")
      .replace(/\s+,/g, ",")          // tira espaço antes de vírgula (vinha de " | ")
      .replace(/(?:,\s*){2,}/g, ", ") // colapsa vírgulas repetidas
      .replace(/^[,\s]+|[,\s]+$/g, "")
      .trim();

  // Só anexa o número se ele já não estiver dentro do bloco da rua (evita duplicar).
  const streetLine = flat(number && !street.includes(number) ? `${street}, ${number}` : street);
  const cityCep = flat([city, postalCode].filter(Boolean).join(" - "));

  pushField(recipientName, 40, 12);                  // destinatário (destaque)
  if (streetLine) pushField(streetLine, 28, 8, 3);   // rua (pode conter o bloco todo → até 3 linhas)
  if (complement) pushField(complement, 26, 8);
  if (neighborhood) pushField(neighborhood, 28, 8);  // pula se vazio
  if (cityCep) pushField(cityCep, 28, 8);            // pula se vazio
  // tira o prefixo "REGIAO " redundante (campo do Kommo às vezes é "Região Sul")
  pushField(`REGIAO: ${internalOrderNotes.replace(/^REGIAO\s+/, "")}`, 22, 0);

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
