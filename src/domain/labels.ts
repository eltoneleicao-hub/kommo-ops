import { parseAddressField } from "./address-parser";
import { toAsciiText } from "./encoding";
import { cityForOutras, resolveRegion, resolveRegionFromText } from "./region-resolver";

/**
 * Assinatura de DEDUPLICAÇÃO de uma etiqueta: identifica o mesmo destinatário
 * (nome + endereço) de forma tolerante a acento/maiúscula/pontuação/formatação.
 * Dois leads diferentes com a MESMA assinatura = etiqueta duplicada (não deve
 * imprimir 2x). Vazio se não houver nome nem endereço (não deduplica nada).
 */
export function labelDedupeKey(input: LabelInput): string {
  const norm = (s: string | null | undefined) =>
    toAsciiText(s).toLowerCase().replace(/[^a-z0-9\s]+/g, "").replace(/\s+/g, " ").trim();
  const parts = [input.recipientName, input.street, input.number, input.neighborhood, input.postalCode, input.city]
    .map(norm);
  const joined = parts.join("|");
  // precisa ter nome E algum endereço pra ser uma assinatura confiável
  return norm(input.recipientName) && parts.slice(1).some(Boolean) ? joined : "";
}

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

// Exigência MÍNIMA p/ etiqueta: nome + endereço (Rua/Avenida) + região. A região
// pode vir do campo internalOrderNotes OU ser RESOLVIDA do bairro/CEP/endereço
// (ver effectiveRegion) — assim leads SEM o campo preenchido no Kommo ainda
// imprimem, sem editar o Kommo. (telefone removido em 2026-06-17.)

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

const ZONES = new Set(["centro", "norte", "sul", "leste", "oeste", "sudeste"]);

/** Região efetiva: usa o campo internalOrderNotes se preenchido; senão RESOLVE do
 *  bairro/CEP/endereço.
 *  Conflito (c): se o campo é uma zona mas o BAIRRO casa EXATO (alta) com OUTRA
 *  zona E o CEP NÃO apoia o campo → corrige p/ a do bairro (dupla evidência de que
 *  o SELECT foi mal-clicado). Se o CEP apoia o campo (empate) → mantém o SELECT.
 *  "" quando nada resolve com confiança (baixa). */
export function effectiveRegion(input: LabelInput): string {
  // prefixo "Regiao "/"Região " (o "." casa a/ã sem literal não-ASCII — evita
  // o bug de minificação da Vercel com chars acentuados no source)
  const field = clean(input.internalOrderNotes).replace(/^regi.o\s+/i, "");
  if (field) {
    const fieldLc = field.toLowerCase();
    if (ZONES.has(fieldLc)) {
      const byBairro = resolveRegion(input.neighborhood, input.postalCode);
      if (byBairro.regiao && byBairro.confidence === "alta" && byBairro.regiao.toLowerCase() !== fieldLc) {
        const cepZone = resolveRegion("", input.postalCode); // só CEP (bairro vazio)
        const cepApoiaCampo = !!cepZone.regiao && cepZone.regiao.toLowerCase() === fieldLc;
        if (!cepApoiaCampo) return byBairro.regiao; // bairro exato + CEP != campo → corrige
      }
    }
    return field;
  }
  const byBairro = resolveRegion(input.neighborhood, input.postalCode);
  const best = byBairro.regiao ? byBairro : resolveRegionFromText(input.street, input.postalCode);
  return best.regiao && best.confidence !== "baixa" ? best.regiao : "";
}

/** O texto PARECE um endereço? (tem tipo de via, CEP, número de imóvel ou rótulo).
 *  Tokens curtos/ambíguos ("via","pq","jd") ficam DE FORA de propósito p/ não dar
 *  falso-positivo de endereço em texto casual. */
export function isAddressLike(text: string | null | undefined): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  if (/\b(rua|r\.|av|av\.|avenida|travessa|trav|alameda|estrada|estr|rodovia|rod|pra.a|condom|condominio|jardim|parque|vila|residencial|bairro|cep|numero|n.mero|logradouro|endere.o|loteamento|chacara)\b/i.test(t)) return true;
  if (/\d{5}-?\d{3}/.test(t)) return true;                              // CEP
  if (/(?:^|[\s,;-])\d{1,5}[A-Za-z]?(?:[\s,;]|$)/.test(t)) return true; // número de imóvel
  return false;
}

/** Detecta valor do campo Rua que NÃO é endereço (frase/mensagem, "Ok", "Não",
 *  pontuação solta). CONSERVADOR: só acusa quando não há NENHUM sinal de endereço,
 *  pra nunca rejeitar um endereço real (preferimos imprimir a deixar de imprimir). */
export function isNonAddress(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;                  // vazio = "faltando" tratado em outro lugar
  if (isAddressLike(t)) return false;
  const ascii = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const norm = ascii.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const JUNK = new Set(["nao", "nao sei", "naosei", "ok", "sim", "nada", "teste", "test", "x", "xx", "xxx", "asd", "na", "aaa"]);
  if (JUNK.has(norm)) return true;
  const letters = (ascii.match(/[a-z]/gi) || []).length;
  if (t.length < 4 || letters < 3) return true;                  // "Ok", "A", ",", "Nao"
  if (t.split(/\s+/).length >= 6 || t.includes("?")) return true; // frase/mensagem
  return false;                          // ambíguo curto → mantém (conservador)
}

export function validateLabelInput(input: LabelInput): string[] {
  const normalized = normalizeAddressInput(input);
  const missing: string[] = [];
  if (!clean(normalized.recipientName)) missing.push("nome do destinatario");
  if (!clean(normalized.street) || isNonAddress(normalized.street)) missing.push("Rua/Avenida");
  if (!effectiveRegion(normalized)) missing.push("Região");
  return missing;
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

  // Região da etiqueta = a MESMA da elegibilidade (campo do Kommo OU resolvida do
  // bairro/CEP/endereço). Sem isso, um lead que ficou elegível por auto-resolução
  // sairia com "REGIAO:" em branco. effectiveRegion já remove o prefixo "Regiao ".
  const regiaoVal = effectiveRegion(normalized);
  // Balde "Outras" (fora de SJC): mostra a CIDADE no lugar de "REGIAO: OUTRAS".
  const addr = [normalized.street, normalized.neighborhood, normalized.complement].filter(Boolean).join(" ");
  const lastLine = /^outras\b/i.test(regiaoVal)
    ? (cityForOutras(normalized.city, addr) || "FORA DE SJC").toUpperCase()
    : `REGIAO: ${regiaoVal}`;

  lines.push(
    clean(normalized.neighborhood),
    `${clean(normalized.city)} - CEP ${clean(normalized.postalCode)}`,
    "",
    lastLine,
  );

  return lines.join("\n");
}
