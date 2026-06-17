/**
 * encoding.ts
 *
 * Conserta "mojibake" — texto UTF-8 que foi lido como Windows-1252 (CP1252) e
 * re-gravado como UTF-8. É o estrago clássico de leads importados no Kommo via
 * CSV do Excel (Windows). Ex.: "SÃO JOSÉ" vira "SÃƒO JOSÃ‰".
 *
 * A correção reconstrói os bytes CP1252 originais e os redecodifica como UTF-8.
 * É CONSERVADORA: se o resultado não for UTF-8 válido, devolve a string
 * original intacta — texto já correto NÃO é alterado.
 */

// Mapa reverso dos caracteres "especiais" do CP1252 (faixa 0x80–0x9F), que
// diferem do Latin-1. Necessário pra reconstruir os bytes originais.
const CP1252_REVERSE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

const utf8Strict = new TextDecoder("utf-8", { fatal: true });

export function fixMojibake(value: string | null | undefined): string {
  const s = String(value ?? "");
  // Mojibake sempre introduz Â (0xC2) ou Ã (0xC3) — primeiro byte das sequências
  // UTF-8 mal-decodificadas. Sem isso, não há o que consertar.
  if (!/[ÂÃ]/.test(s)) return s;

  // Reconstrói os bytes CP1252 originais.
  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp <= 0xff) {
      bytes.push(cp); // 0x00–0xFF: CP1252 == Unicode (exceto faixa especial, abaixo)
    } else if (CP1252_REVERSE[cp] !== undefined) {
      bytes.push(CP1252_REVERSE[cp]);
    } else {
      return s; // caractere fora do CP1252 → não é mojibake → mantém intacto
    }
  }

  // Redecodifica como UTF-8 estrito. Se falhar (ou virar caractere de
  // substituição), o texto já estava correto → devolve o original.
  try {
    const decoded = utf8Strict.decode(Uint8Array.from(bytes));
    if (decoded.includes("�")) return s;
    return decoded;
  } catch {
    return s;
  }
}
