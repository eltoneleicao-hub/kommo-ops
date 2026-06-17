/**
 * encoding.ts
 *
 * Lida com "mojibake" - texto UTF-8 que foi lido como Windows-1252 (CP1252) e
 * re-gravado como UTF-8. Estrago classico de leads importados no Kommo via CSV
 * do Excel (Windows). Ex.: "Sao Jose" vira "SÃ£o JosÃ©".
 *
 * IMPORTANTE: os LITERAIS de codigo (regex e strings) sao 100% ASCII, usando
 * escapes \uXXXX. Literais acentuados no source se mostraram frageis no build
 * minificado da Vercel (o reparo funcionava local mas NAO em producao). Mantenha
 * assim - nao troque os \u por caracteres acentuados.
 */

// Mapa reverso dos caracteres "especiais" do CP1252 (faixa 0x80-0x9F), que
// diferem do Latin-1. Necessario pra reconstruir os bytes originais de letras
// acentuadas MAIUSCULAS (ex.: E-agudo = UTF-8 C3 89; o 0x89 vira U+2030 no CP1252).
const CP1252_REVERSE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

const utf8Strict = new TextDecoder("utf-8", { fatal: true });

/**
 * Reverte mojibake UTF-8-lido-como-CP1252. Conservadora: se o resultado nao for
 * UTF-8 valido, devolve a string original - texto ja correto NAO e alterado.
 */
export function fixMojibake(value: string | null | undefined): string {
  const s = String(value ?? "");
  // Marcador de mojibake: o byte-lider de uma sequencia UTF-8 mal-decodificada
  // vira A-circ (U+00C2) ou A-til (U+00C3). Sem isso, nao ha o que reparar.
  if (!/[\u00C2\u00C3]/.test(s)) return s;

  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp <= 0xff) {
      bytes.push(cp); // 0x00-0xFF: CP1252 == Unicode
    } else if (CP1252_REVERSE[cp] !== undefined) {
      bytes.push(CP1252_REVERSE[cp]);
    } else {
      return s; // caractere fora do CP1252 -> nao e mojibake -> mantem
    }
  }

  try {
    const decoded = utf8Strict.decode(Uint8Array.from(bytes));
    if (decoded.includes("\uFFFD")) return s; // char de substituicao -> nao era mojibake
    return decoded;
  } catch {
    return s;
  }
}

/**
 * Translitera texto para ASCII puro, a prova de qualquer encoding:
 *   1. repara mojibake (recupera "Sao Jose" de "SÃ£o JosÃ©");
 *   2. decompoe acentos via NFKD e remove as marcas combinantes (a-agudo->a...);
 *   3. descarta qualquer residuo nao-ASCII (saida so com 0x00-0x7F).
 *
 * Para etiquetas de entrega, "SAO JOSE" e claro e elimina dependencia de ^CI28,
 * glifos da fonte da Zebra e encoding do agente de impressao.
 */
export function toAsciiText(value: string | null | undefined): string {
  const repaired = fixMojibake(value);
  return repaired
    .normalize("NFKD")                  // separa letra-base + marca de acento
    .replace(/[\u0300-\u036f]/g, "")    // remove as marcas combinantes
    .replace(/[^\x00-\x7f]/g, "");      // remove o que sobrar de nao-ASCII
}
