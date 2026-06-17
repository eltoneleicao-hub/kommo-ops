/**
 * address-parser.ts
 *
 * Parser robusto para o campo "Rua/Avenida" do Kommo que às vezes chega
 * com número, CEP e bairro embutidos num único texto.
 *
 * Objetivo: capturar ~90% dos casos reais sem over-engineering.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ParseConfidence = "high" | "medium" | "low";

export interface AddressFields {
  /** Apenas o logradouro limpo: "Rua Manoel Fiel Filho" */
  street: string;
  /** Número do imóvel: "204" */
  number: string;
  /** Bairro: "Bosque dos Eucaliptos" */
  neighborhood: string;
  /** CEP sem máscara: "12233690" */
  postalCode: string;
  /** Cidade quando vem embutida (ex.: "Bairro - Cidade"): "São José dos Campos" */
  city: string;
  /** Complemento: "Apto 3" */
  complement: string;
}

export interface ParsedAddress extends AddressFields {
  /**
   * high   — todos os campos foram extraídos com segurança
   * medium — a maioria foi extraída mas um campo ficou ambíguo
   * low    — parse parcial; verifique parsed_fallback no log
   */
  confidence: ParseConfidence;
  /** Texto original recebido no campo Rua/Avenida */
  rawStreet: string;
  /** Campos que vieram de fallback (texto residual não parseado) */
  parsedFallback: string[];
}

export interface OtherAddressFields {
  number?: string | null;
  postalCode?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  city?: string | null;
}

// ─── Regex helpers ────────────────────────────────────────────────────────────

/** CEP com ou sem máscara: 12345-678 ou 12345678 */
const RE_CEP = /\b(\d{5}-?\d{3})\b/;

/** Número isolado de imóvel: ", 123" | "nº 123" | "n° 123" | "- 123" */
const RE_NUMBER = /(?:,\s*|[-–]\s*|n[º°]?\s*)(\d{1,6}[A-Za-z]?)\b/i;

/** "Bairro Fulano" ou "Bairro: Fulano" */
const RE_BAIRRO_LABEL = /\bBairro\s*:?\s+([^,\-–]+)/i;

/** Separadores comuns no campo livre */
const RE_SEPARATOR = /\s*[,;]\s*|\s+[-–]\s+/;

// ─── Utilitários ──────────────────────────────────────────────────────────────

function clean(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function normalizeCep(raw: string): string {
  return raw.replace("-", "").trim();
}

/** Remove trechos do texto que já foram capturados por outra extração */
function remove(text: string, pattern: RegExp): string {
  return text.replace(pattern, "").trim();
}

function removeExact(text: string, value: string): string {
  // escapa caracteres especiais de regex no valor literal
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\s*,?\\s*${escaped}\\s*,?\\s*`, "i"), " ").trim();
}

// ─── Extratores individuais ───────────────────────────────────────────────────

function extractCep(text: string): { cep: string; remaining: string } {
  const m = RE_CEP.exec(text);
  if (!m) return { cep: "", remaining: text };
  return {
    cep: normalizeCep(m[1]),
    remaining: remove(text, RE_CEP),
  };
}

function extractNumber(text: string): { number: string; remaining: string } {
  const m = RE_NUMBER.exec(text);
  if (!m) return { number: "", remaining: text };
  return {
    number: m[1].trim(),
    remaining: remove(text, RE_NUMBER),
  };
}

function extractBairroLabel(text: string): { neighborhood: string; remaining: string } {
  const m = RE_BAIRRO_LABEL.exec(text);
  if (!m) return { neighborhood: "", remaining: text };
  return {
    neighborhood: m[1].trim(),
    remaining: remove(text, RE_BAIRRO_LABEL),
  };
}

// ─── Estratégias de parse ─────────────────────────────────────────────────────

/**
 * Estratégia 1 — campo vem como segmentos separados por vírgula/hífen.
 * Ex: "Rua Manoel Fiel Filho, 204, CEP 12233-690, Bosque dos eucaliptos"
 *     "Rua X, 123 - Bairro Z"
 *     "Rua X - nº 100 - Bairro Z - 98765-432"
 */
function parseSegmented(raw: string): Partial<AddressFields> & { remainder: string } {
  const segments = raw.split(RE_SEPARATOR).map((s) => s.trim()).filter(Boolean);

  const result: Partial<AddressFields> = {};
  const usedIndexes = new Set<number>();

  // Primeiro segmento é sempre o logradouro (Rua/Av)
  if (segments.length > 0) {
    result.street = segments[0];
    usedIndexes.add(0);
  }

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];

    // CEP (pode vir com prefixo "CEP")
    const cepMatch = /(?:CEP\s*:?\s*)?(\d{5}-?\d{3})/i.exec(seg);
    if (cepMatch && !result.postalCode) {
      result.postalCode = normalizeCep(cepMatch[1]);
      usedIndexes.add(i);
      continue;
    }

    // Número puro ou "nº 123"
    const numMatch = /^(?:n[º°]?\s*)?(\d{1,6}[A-Za-z]?)$/.exec(seg);
    if (numMatch && !result.number) {
      result.number = numMatch[1];
      usedIndexes.add(i);
      continue;
    }

    // Bairro com label explícito
    const bairroMatch = /^Bairro\s*:?\s*(.+)/i.exec(seg);
    if (bairroMatch && !result.neighborhood) {
      result.neighborhood = bairroMatch[1].trim();
      usedIndexes.add(i);
      continue;
    }
  }

  // Segunda passagem: segmentos restantes puramente textuais (sem dígitos
  // significativos e sem CEP) são candidatos a bairro quando ainda não temos um.
  const textOnlySegments = segments
    .map((seg, i) => ({ seg, i }))
    .filter(({ i }) => !usedIndexes.has(i))
    // ignora segmento 0 (já é o logradouro)
    .filter(({ i }) => i > 0)
    // segmento com letras mas sem padrão numérico dominante
    .filter(({ seg }) => /[A-Za-zÀ-ú]/.test(seg) && !/^\d+[A-Za-z]?$/.test(seg));

  if (textOnlySegments.length > 0 && !result.neighborhood) {
    const candidate = textOnlySegments[0];
    result.neighborhood = candidate.seg;
    usedIndexes.add(candidate.i);
  }

  // Segmentos ainda não reconhecidos → remainder para complemento/fallback
  const remainder = segments
    .filter((_, i) => !usedIndexes.has(i))
    .join(", ");

  return { ...result, remainder };
}

/**
 * Estratégia 2 — campo vem como bloco único sem separadores claros.
 * Tenta extrair CEP e número por regex, e trata o resto como logradouro.
 */
function parseFreeform(raw: string): Partial<AddressFields> & { remainder: string } {
  let working = raw;
  const result: Partial<AddressFields> = {};

  const { cep, remaining: afterCep } = extractCep(working);
  if (cep) { result.postalCode = cep; working = afterCep; }

  const { number, remaining: afterNum } = extractNumber(working);
  if (number) { result.number = number; working = afterNum; }

  const { neighborhood, remaining: afterBairro } = extractBairroLabel(working);
  if (neighborhood) { result.neighborhood = neighborhood; working = afterBairro; }

  // O que sobra deve ser o logradouro limpo
  result.street = working.replace(/^[,\s\-–]+|[,\s\-–]+$/g, "").trim();

  return { ...result, remainder: "" };
}

/**
 * Estratégia 0 — bloco rotulado, possivelmente com Origem/Destino.
 * Ex:
 *   Origem:
 *   Rua Java, 174 ...
 *
 *   Destino:
 *   Rua: Ana Benedita de Miranda n° 75 - Casa
 *   Bairro: Floresta - São Jose dos campos
 *   Condomínio: Reserva Aruana
 *   CEP: 12226 -357
 *
 * Regras: (1) se houver "Destino:", usa só o que vem depois; (2) lê os rótulos
 * Rua/Bairro/CEP/Condomínio linha a linha; (3) normaliza CEP com espaço.
 * Retorna null se o texto não parecer um bloco rotulado (deixa as outras
 * estratégias assumirem).
 */
function parseLabeledBlock(
  raw: string,
): (Partial<AddressFields> & { city?: string }) | null {
  // Só vale para blocos MULTILINHA (Origem/Destino, um rótulo por linha).
  // Endereços de uma linha só continuam com as estratégias segmentada/freeform.
  if (!/\r?\n/.test(raw)) return null;

  let text = raw;

  // (1) Se tem "Destino:", descarta tudo antes dele (ignora a Origem).
  const destino = /destino\s*:?/i.exec(text);
  if (destino) {
    text = text.slice(destino.index + destino[0].length);
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Só assume essa estratégia se houver rótulos reconhecíveis.
  const labelRe = /^(rua|avenida|av|travessa|alameda|estrada|rodovia|pra[cç]a|bairro|cep|condom[ií]nio|complemento)\b/i;
  if (!lines.some((l) => labelRe.test(l))) return null;

  const result: Partial<AddressFields> & { city?: string } = {};
  const complementParts: string[] = [];

  const prefixMap: Record<string, string> = {
    rua: "Rua", avenida: "Avenida", av: "Av.", travessa: "Travessa",
    alameda: "Alameda", estrada: "Estrada", rodovia: "Rodovia", praca: "Praça",
  };

  for (const line of lines) {
    // (3) CEP (tolera espaço: "12226 -357")
    const cepM = /cep\s*:?\s*(\d{5}\s*-?\s*\d{3})/i.exec(line);
    if (cepM && !result.postalCode) {
      result.postalCode = normalizeCep(cepM[1].replace(/\s/g, ""));
      continue;
    }

    // Bairro (pode trazer cidade após " - ")
    const bairroM = /bairro\s*:?\s*(.+)/i.exec(line);
    if (bairroM && !result.neighborhood) {
      const parts = bairroM[1].split(/\s*[-–]\s*/);
      result.neighborhood = parts[0].trim();
      if (parts.length > 1) result.city = parts.slice(1).join(" - ").trim();
      continue;
    }

    // Condomínio / Complemento → vão para complemento
    const condoM = /(?:condom[ií]nio|complemento)\s*:?\s*(.+)/i.exec(line);
    if (condoM) { complementParts.push(condoM[1].trim()); continue; }

    // Logradouro: "Rua: Ana ... n° 75 - Casa"
    const logM = /^(rua|avenida|av|travessa|alameda|estrada|rodovia|pra[cç]a)\.?\s*:?\s*(.+)/i.exec(line);
    if (logM && !result.street) {
      const tipo = logM[1].toLowerCase().replace("ç", "c");
      let rest = logM[2].trim();

      let numM = /(?:,\s*|[-–]\s*|n[º°]?\s*)(\d{1,6}[A-Za-z]?)\b/i.exec(rest);
      if (!numM) numM = /\s(\d{1,6}[A-Za-z]?)\s*$/.exec(rest); // número no fim: "das Flores 100"
      if (numM) {
        result.number = numM[1];
        const after = rest.slice(numM.index + numM[0].length).replace(/^[\s,\-–]+/, "").trim();
        if (after) complementParts.push(after);
        rest = rest.slice(0, numM.index).trim();
      }

      const prefix = prefixMap[tipo] || "";
      result.street = (prefix ? prefix + " " : "") + rest.replace(/[,\-–\s]+$/, "").trim();
      continue;
    }
  }

  if (complementParts.length) result.complement = complementParts.join(" - ");

  // Válido se extraiu pelo menos logradouro, CEP ou bairro.
  if (!result.street && !result.postalCode && !result.neighborhood) return null;
  return result;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Faz o parse do campo "Rua/Avenida" combinado com outros campos do formulário.
 *
 * @param streetField - Valor bruto do campo Rua/Avenida
 * @param otherFields - Demais campos do formulário (podem estar vazios)
 * @returns ParsedAddress com score de confiança e log de fallbacks
 */
export function parseAddressField(
  streetField: string,
  otherFields: OtherAddressFields = {},
): ParsedAddress {
  const raw = clean(streetField);
  const fallbacks: string[] = [];

  // ── Etapa 1: extrair o que vier do campo street ──────────────────────────

  let fromStreet: Partial<AddressFields> & { remainder?: string; city?: string };

  // Etapa 0 (prioritária): bloco rotulado / Origem-Destino.
  const labeled = parseLabeledBlock(raw);
  if (labeled) {
    fromStreet = labeled;
  } else {
    // Heurística: se tem vírgula ou hífen rodeado de espaços → segmentado
    const hasSegments = /[,;]|\s[-–]\s/.test(raw);
    fromStreet = hasSegments ? parseSegmented(raw) : parseFreeform(raw);
  }

  // ── Etapa 2: mesclar com campos externos (campos externos têm prioridade) ─

  const street      = clean(fromStreet.street);
  const number      = clean(otherFields.number) || clean(fromStreet.number);
  const neighborhood = clean(otherFields.neighborhood) || clean(fromStreet.neighborhood);
  const postalCode  = normalizeCep(clean(otherFields.postalCode) || clean(fromStreet.postalCode ?? ""));
  const city        = clean(otherFields.city) || clean(fromStreet.city);
  const complement  = clean(otherFields.complement) || clean(fromStreet.complement) || clean(fromStreet.remainder);

  // ── Etapa 3: detectar campos que não foram resolvidos ────────────────────

  if (!street)      fallbacks.push("street");
  if (!number)      fallbacks.push("number");
  if (!neighborhood) fallbacks.push("neighborhood");
  if (!postalCode)  fallbacks.push("postalCode");

  // ── Etapa 4: calcular confiança ──────────────────────────────────────────

  let confidence: ParseConfidence;
  if (fallbacks.length === 0) {
    confidence = "high";
  } else if (fallbacks.length <= 1) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Adicionar ao log quando houve fallback real (campo continua vazio)
  if (fallbacks.length > 0) {
    console.warn(
      `[address-parser] confidence=${confidence} fallbacks=${fallbacks.join(",")} raw="${raw}"`,
    );
  }

  return {
    street,
    number,
    neighborhood,
    postalCode,
    city,
    complement,
    confidence,
    rawStreet: raw,
    parsedFallback: fallbacks,
  };
}
