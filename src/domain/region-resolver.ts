/**
 * region-resolver.ts
 *
 * Resolve a REGIÃO administrativa de São José dos Campos a partir do bairro
 * (e, como reforço, do CEP).
 *
 * Divisão OFICIAL da cidade: 6 regiões + distritos embutidos.
 *   Centro · Norte · Sul · Leste · Oeste · Sudeste
 *   (São Francisco Xavier → Norte · Eugênio de Melo → Leste)
 *
 * Estratégia de resolução (cascata):
 *   1. Bairro reconhecido e não-ambíguo  → confiança "alta"
 *   2. Bairro ambíguo (fronteira)        → desempate por faixa de CEP → "media"
 *   3. Bairro vazio/desconhecido         → faixa de CEP → "media"
 *   4. Nada resolve                      → "indefinida" → operador revisa
 *
 * Fonte: Wikipédia "Lista de bairros de São José dos Campos" + verificação
 * de bairros de fronteira por CEP (Correios). Ambíguos resolvidos:
 *   Jardim Ismênia → Leste (CEP 1222x) · Royal Park → Oeste (Aquarius, 12246)
 *   Res. Sunset Park / Jardim Altos do Esplanada → Oeste (Aquarius)
 */

export type Regiao = "Centro" | "Norte" | "Sul" | "Leste" | "Oeste" | "Sudeste";

export type RegionConfidence = "alta" | "media" | "baixa";

export interface RegionResult {
  /** Região resolvida, ou null se não foi possível determinar. */
  regiao: Regiao | null;
  confidence: RegionConfidence;
  /** Como foi resolvido. "fuzzy" = casou por aproximação (typo/abreviação).
   *  "alias" = casou na tabela curada de variantes verificadas (prefixo omitido,
   *  abreviação, ou bairro real fora da lista oficial de 6 regiões). */
  method: "bairro" | "alias" | "fuzzy" | "cep" | "ambiguo-cep" | "indefinida";
  /** Texto do bairro normalizado usado na busca (debug). */
  matchedBairro?: string;
}

/* ── Normalização ──────────────────────────────────────────────────────────
 * sem acento · minúsculo · espaços colapsados · sem pontuação solta.
 */
export function normalizeBairro(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Expansão de abreviações comuns dos formulários (Jd. → Jardim etc.) ───────
 * Aplicada ao índice E à entrada, para casar abreviado ↔ por extenso.
 */
const ABBREV: Record<string, string> = {
  jd: "jardim", jrd: "jardim", jdm: "jardim", jardin: "jardim",
  vl: "vila", villa: "vila",
  pq: "parque",
  res: "residencial", resid: "residencial",
  cj: "conjunto", conj: "conjunto",
  hab: "habitacional",
  cond: "condominio",
  chac: "chacara",
  faz: "fazenda", fzd: "fazenda",
  pres: "presidente",
  sta: "santa", sto: "santo",
  pe: "padre", dr: "doutor", eng: "engenheiro",
};

function expandAbbrev(norm: string): string {
  if (!norm) return norm;
  return norm
    .split(" ")
    .map((t) => ABBREV[t] ?? t)
    .join(" ");
}

/** Chave canônica de bairro: normaliza + expande abreviações. */
function bairroKey(value: string | null | undefined): string {
  return expandAbbrev(normalizeBairro(value));
}

/** Distância de edição (Levenshtein) entre duas strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Casamento aproximado p/ tolerar erros de digitação (ex.: "Barrinho" →
 * "Bairrinho"). Só aceita quando o erro é pequeno E o melhor casamento aponta
 * para UMA única região (evita rotear errado um typo ambíguo entre regiões).
 */
function fuzzyRegion(norm: string): Regiao | null {
  if (norm.length < 5) return null;
  let best = Infinity;
  let regioes = new Set<Regiao>();
  for (const [key, regiao] of BAIRRO_INDEX) {
    if (Math.abs(key.length - norm.length) > 3) continue; // poda óbvia
    const d = levenshtein(norm, key);
    if (d < best) {
      best = d;
      regioes = new Set([regiao]);
    } else if (d === best) {
      regioes.add(regiao);
    }
  }
  const limit = norm.length >= 8 ? 2 : 1;
  return best <= limit && regioes.size === 1 ? [...regioes][0] : null;
}

/* ── Dados: bairros por região (forma legível; normalizados em runtime) ──────
 * Os bairros de fronteira já estão alocados na região correta (ver cabeçalho).
 */
const BAIRROS_POR_REGIAO: Record<Regiao, string[]> = {
  Centro: [
    "Banhado", "Bairro dos Pinheiros", "Centro", "Chácara dos Eucaliptos",
    "Conj. Hab. Vale dos Pinheiros", "Conj. Res. Monte Castelo",
    "Favela Vila Nova Esperança", "Jardim Aparecida", "Jardim Apolo I",
    "Jardim Apolo II", "Jardim Augusta", "Jardim Azevedo", "Jardim Bandeirantes",
    "Jardim Bela Vista", "Jardim Corinthians", "Jardim Esplanada",
    "Jardim Esplanada II", "Jardim Frei Leopoldo", "Jardim Jussara",
    "Jardim Margareth", "Jardim Maringá", "Jardim Matarazzo",
    "Jardim Nossa Senhora de Fátima", "Jardim Nova América", "Jardim Nova Europa",
    "Jardim Oswaldo Cruz", "Jardim Paulista", "Jardim Renata",
    "Jardim Santa Madalena", "Jardim Santos Dumont", "Jardim São Dimas",
    "Jardim São José", "Jardim Topázio", "Jardim Vale Paraíso", "Monte Castelo",
    "Res. Esplanada do Sol", "Res. Martins Pereira", "Vila Abel", "Vila Ady'Ana",
    "Vila Adyana", "Vila Betânia", "Vila Cardoso", "Vila Ema", "Vila Guaianazes",
    "Vila Guarani", "Vila Higienópolis", "Vila Icaraí", "Vila Igualdade",
    "Vila Ipiranga", "Vila Jaci", "Vila Kennedy", "Vila Luzia", "Vila Maria",
    "Vila Mascarenhas Ferraz", "Vila Nova Conceição", "Vila Nova São José",
    "Vila Nove de Julho", "Vila Paganini", "Vila Paulo Setúbal", "Vila Piratininga",
    "Vila Progresso", "Vila Rubi", "Vila Sanches", "Vila Santa Cruz I",
    "Vila Santa Cruz II", "Vila Santa Cruz III", "Vila Santa Helena",
    "Vila Santa Luzia", "Vila Santa Rita", "Vila Santos", "Vila São Paulo",
    "Vila São Pedro", "Vila Terezinha",
  ],
  Norte: [
    "Águas do Canindu", "Altos da Vila Paiva", "Alto da Ponte",
    "Bairro dos Ferreiras", "Buquirinha", "Caête", "Colinas do Parahyba",
    "Conj. Hab. Nova Cristina", "Conj. Hab. São Geraldo", "Conj. Res. Nova Cristina",
    "Espelho d'Água", "Favela Vila Rhodia", "Fazenda Jataí", "Hawai", "Jaguariuna",
    "Jardim Altos de Santana", "Jardim Boa Vista", "Jardim Guimarães", "Jardim Jaci",
    "Jardim Maritéia", "Jardim Nova Paulicéia", "Jardim Ouro Preto", "Miranda",
    "Oliveiras", "Recanto Caetê", "Rhodia", "Santana", "São Francisco Xavier",
    "São Sebastião", "Vargem Grande", "Vila Alexandrina", "Vila Cândida",
    "Vila César", "Vila Chiquinha", "Vila Cristina", "Vila do Carmo", "Vila do Pena",
    "Vila Esmeralda", "Vila Leila", "Vila Leila II", "Vila Leonídia", "Vila Machado",
    "Vila Monte Alegre", "Vila Nair", "Vila Nossa Senhora das Graças", "Vila Paiva",
    "Vila Pasto Alto", "Vila Rangel", "Vila Rossi", "Vila São Geraldo",
    "Vila Santarém", "Vila Simone", "Vila Sinhá", "Vila Unidos", "Vila Veneziani",
    "Vila Zizinha",
  ],
  Sul: [
    "Bosque dos Eucaliptos", "Bosque dos Ipês", "Campo dos Alemães", "Capitingal",
    "Caramujo", "Chácaras Reunidas", "Cidade Morumbi", "Conj. Hab. Dom Pedro I",
    "Conj. Hab. Dom Pedro II", "Conj. Hab. Elmano F. Veloso", "Conj. Res. 31 de Março",
    "Conj. Res. Cidade Jardim", "Conj. Res. Jardim das Flores",
    "Conj. Res. Morada do Sol", "Conj. Res. Morumbi", "Conj. Res. Papa João Paulo II",
    "Conj. Res. Primavera", "Conj. Res. Recanto dos Eucaliptos",
    "Conj. Res. Recanto dos Pinheiros", "Conj. Res. Sol Nascente",
    "Floradas de São José", "Jardim América", "Jardim Anhembi", "Jardim Aeroporto",
    "Jardim Colonial", "Jardim Cruzeiro do Sul", "Jardim das Azaléias",
    "Jardim del Rey", "Jardim do Céu", "Jardim dos Bandeirantes", "Jardim Estoril",
    "Jardim Imperial", "Jardim Juliana", "Jardim Madureira", "Jardim Mesquita",
    "Jardim Nova República", "Jardim Oriental", "Jardim Oriente", "Jardim Paraíso",
    "Jardim Petrópolis", "Jardim Portugal", "Jardim República", "Jardim Rosário",
    "Jardim Satélite", "Jardim Sul", "Jardim Terras do Sul", "Jardim Vale do Sol",
    "Jardim Veneza", "Palmeiras de São José", "Parque dos Ipês",
    "Parque Independência", "Parque Industrial", "Parque Interlagos",
    "Parque Residencial União", "Pernambucana de Baixo", "Pinheirinho",
    "Projeto Torrão de Ouro", "Quinta das Flores", "Res. Altos do Bosque",
    "Res. De Ville", "Res. Gazzo", "Res. Jardins", "Res. San Marino", "Rio Comprido",
    "Terrinha", "Torrão de Ouro I", "Torrão de Ouro II", "Vila das Acácias",
    "Vila das Flores", "Vila Letônia", "Vila Luchetti", "Vila São Bento", "Xingu",
  ],
  Leste: [
    "Águas da Prata", "Araújo", "Bairrinho", "Bairro Cajurú", "Bica d'Água",
    "Bom Retiro", "Cambucá", "Campos de São José", "Capão Grosso", "Capão Grosso II",
    "Castanheira II", "Chácara Boa Esperança", "Chácara Capão Grosso",
    "Chácara Majestic", "Chácara Pousada do Vale", "Chácara Santa Luzia",
    "Chácara São Vicente", "Chácara Sítio Jataí", "Cidade Vista Verde",
    "Condomínio Floresta", "Conj. Hab. Intervale", "Conj. Hab. São José",
    "Conj. Hab. Vila Tatetuba", "Conj. Integração", "Conj. Res. JK",
    "Conj. Res. Parque das Américas", "Conj. Res. Planalto", "Ebenezer",
    "Eugênio de Melo", "Fazenda Bom Retiro", "Fazenda Honda",
    "Fazenda Nossa Senhora da Conceição", "Fazenda Pilão Arcado", "Fazenda Taira",
    "Fazenda Takanashi", "Fazenda Toninho Ferreira", "Fazenda Vila Franca",
    "Frei Galvão", "Jardim Americano", "Jardim Brasília", "Jardim Castanheiras",
    "Jardim Cerejeiras", "Jardim Copacabana", "Jardim Coqueiro", "Jardim Diamante",
    "Jardim Helena", "Jardim Ipê", "Jardim Ismênia", "Jardim Itapuã",
    "Jardim Maracanã", "Jardim Mariana", "Jardim Mariana II", "Jardim Motorama",
    "Jardim Nova Detroit", "Jardim Nova Flórida", "Jardim Nova Michigan",
    "Jardim Olímpia", "Jardim Paraíso do Sol", "Jardim Pararangaba",
    "Jardim San Rafael", "Jardim Santa Inês I", "Jardim Santa Inês II",
    "Jardim Santa Inês III", "Jardim Santa Lúcia", "Jardim Santa Maria",
    "Jardim São Jorge", "Jardim São Vicente", "Jardim Três José", "Jardim Universo",
    "Jardim Valparaíba", "Mantiqueira I", "Mantiqueira II", "Maravilhas do Cajuru",
    "Martins Guimarães", "Mato Dentro", "Mirante I", "Mirante II", "Morada do Fênix",
    "Morada do Sol", "Nossa Senhora do Bom Retiro", "Nova Michigan II",
    "Nova Michigan III", "Nova Michigan IV", "Parque Nova Esperança",
    "Parque Novo Horizonte", "Portal do Céu", "Pousada do Vale", "Primavera I",
    "Primavera II", "Recanto do Vale", "Recanto dos Lagos", "Renascer I",
    "Renascer II", "Res. Ana Maria", "Res. Armando Moreira Righi", "Res. da Ribeira",
    "Res. Dom Bosco", "Res. Galo Branco", "Res. Vista Linda", "Ressaca",
    "Santa Cecília I", "Santa Cecília II", "Santa Helena", "Santa Hermínia",
    "Santa Maria I", "Santa Rita", "Serrote", "Sítio Encantado", "Terra Nova",
    "Vilaggio d'Antonini", "Vila Ester", "Vila Industrial", "Vila Matilde",
    "Vila Monterrey", "Vila Patrícia", "Vila Tatetuba", "Vila Tesouro",
  ],
  Oeste: [
    "Beira Rio", "Bosque Imperial", "Jardim Altos do Esplanada", "Jardim Alvorada",
    "Jardim das Colinas", "Jardim das Indústrias", "Jardim Pôr do Sol", "Limoeiro",
    "Parque Residencial Aquarius", "Residencial Jardim Aquarius", "Res. Sunset Park",
    "Royal Park", "Urbanova",
  ],
  Sudeste: [
    "Altos do Uirá", "Chácaras São José", "Conj. Hab. Polícia Militar",
    "Conj. Res. Nosso Teto", "Conj. São Judas Tadeu", "DCTA", "Jardim Colorado",
    "Jardim da Granja", "Jardim do Lago", "Jardim Santa Fé", "Jardim Santa Julia",
    "Jardim Santa Luzia", "Jardim São Judas Tadeu", "Jardim São Leopoldo",
    "Jardim Souto", "Jardim Uirá", "Parque Martim Cererê", "Parque Santa Rita",
    "Parque Santos Dumont", "Pernambucana de Cima", "Putim",
    "Recanto das Jabuticabeiras", "Recanto dos Eucaliptos", "Recanto dos Nobres",
    "Res. Bell Park", "Res. Cambuí", "Res. Flamboyant", "Res. Jatobá",
    "Res. Juritis", "Res. Santa Rosa", "Res. São Francisco", "Sítio Bom Jesus",
    "Terra Brasilis", "Vila Adriana I", "Vila Adriana II", "Vila Iracema",
    "Vila Rica", "Vila São Benedito",
  ],
};

/* ── Bairros SJC reais REGISTRADOS além da lista oficial das 6 regiões ─────────
 * Bairros que existem em SJC mas não constavam na fonte (Wikipédia). Confirmados
 * por pesquisa + verificação adversarial (loteamento da prefeitura, vizinhança).
 * Entram no índice como first-class (match exato + fuzzy + núcleo funcionam).
 */
const BAIRROS_EXTRA: Record<Regiao, string[]> = {
  Centro: [],
  Norte: ["Jardim Telespark", "Jardim Minas Gerais"],
  Sul: ["Jardim Morumbi", "Jardim Primavera"],
  Leste: ["Jardim das Paineiras II", "Setville Altos de São José", "Setville"],
  Oeste: [],
  Sudeste: [],
};

/* ── Bairros de fronteira: confiança reduzida mesmo quando casam por nome ────
 * (o nome aparecia em 2 regiões nas fontes; foi alocado pela melhor evidência).
 */
const BAIRROS_AMBIGUOS = new Set(
  [
    "Jardim Ismênia", "Royal Park", "Res. Sunset Park", "Jardim Altos do Esplanada",
    "Vila Nair", "Vila Nova Conceição",
  ].map(bairroKey)
);

/* ── Faixa de CEP → região (PARCIAL, baseada em amostragem de CEP verificada) ─
 * Usada só como desempate de ambíguos ou quando o bairro é vazio/desconhecido.
 * Chave = 5 primeiros dígitos do CEP. NÃO é exaustiva — ampliar conforme dados.
 */
const CEP5_REGIAO: Record<string, Regiao> = {
  "12200": "Centro",
  "12210": "Centro",
  "12215": "Centro",
  "12220": "Leste", // Vila Industrial / Jardim Ismênia
  "12221": "Leste",
  "12222": "Leste",
  "12223": "Leste",
  "12224": "Leste",
  "12225": "Leste",
  "12227": "Sul",   // Bosque dos Eucaliptos / Jardim Satélite (região)
  "12230": "Sul",
  "12231": "Sul",
  "12232": "Sul",
  "12233": "Sul",   // Bosque dos Eucaliptos (ex.: 12233-690)
  "12238": "Sul",   // Chácaras Reunidas
  "12240": "Oeste", // Aquarius / Jardim das Colinas
  "12242": "Oeste",
  "12243": "Oeste",
  "12244": "Oeste",
  "12246": "Oeste", // Royal Park / Aquarius
  "12247": "Leste", // Eugênio de Melo (distrito leste)
  "12248": "Sudeste",
  "12249": "Sudeste",
};

/* ── Índice normalizado (construído 1x) ──────────────────────────────────────*/
const BAIRRO_INDEX: Map<string, Regiao> = (() => {
  const idx = new Map<string, Regiao>();
  const fontes = [BAIRROS_POR_REGIAO, BAIRROS_EXTRA];
  for (const fonte of fontes) {
    (Object.keys(fonte) as Regiao[]).forEach((regiao) => {
      for (const bairro of fonte[regiao]) {
        idx.set(bairroKey(bairro), regiao);
      }
    });
  }
  return idx;
})();

/* ── Aliases verificados (variantes reais de formulário) ──────────────────────
 * Tabela curada a partir de leads reais que caíam em "revisão manual": variantes
 * com prefixo omitido ("Betânia" p/ Vila Betânia), abreviações ("J das Indústria"),
 * grafias alternativas ("Sam Marino"), e bairros SJC reais que NÃO estão na lista
 * oficial das 6 regiões (Jardim Telespark, Setville, Jardim das Paineiras II,
 * Jardim Morumbi, Jardim Minas Gerais).
 *
 * Cada entrada foi confirmada por pesquisa + verificação adversarial (web/Correios).
 * Bairros de OUTRAS cidades (Jacareí, Taubaté, Mogi, SP capital, litoral) e casos
 * ambíguos NÃO entram aqui de propósito — seguem p/ revisão manual (não dá p/
 * chutar região: a etiqueta vira entrega física). Confiança "media" (variante
 * inferida, não match literal no índice oficial).
 */
const ALIAS_SOURCE: Array<[string, Regiao]> = [
  // Centro
  ["Betânia", "Centro"],            // Vila Betânia
  ["Oswaldo Cruz", "Centro"],       // Jardim Oswaldo Cruz
  // Norte
  ["Altos de Santana", "Norte"],    // Jardim Altos de Santana
  ["Altos Santana", "Norte"],
  ["Jardim Telespark", "Norte"],    // bairro real fora da lista oficial
  ["Telespark", "Norte"],
  ["Jardim Minas Gerais", "Norte"], // bairro real fora da lista oficial
  ["Jardim MG", "Norte"],
  // Sul
  ["San Marino", "Sul"],            // Res. San Marino
  ["Sam Marino", "Sul"],
  ["Jardim San Marino", "Sul"],
  ["Jardim Sam Marino", "Sul"],
  ["31 de Março", "Sul"],           // Conj. Res. 31 de Março
  ["31 Março", "Sul"],
  ["Trinta e Um de Março", "Sul"],
  ["Trinta Um de Março", "Sul"],
  ["Palmeiras", "Sul"],             // Palmeiras de São José
  ["Palmeiras São José", "Sul"],
  ["Oriente", "Sul"],               // Jardim Oriente
  ["Residencial União", "Sul"],     // Parque Residencial União
  ["Terras do Sul", "Sul"],         // Jardim Terras do Sul
  ["Sol Nascente", "Sul"],          // Conj. Res. Sol Nascente
  ["Residencial Sol Nascente", "Sul"],
  ["Independência", "Sul"],         // Parque Independência
  ["Vale do Sol", "Sul"],           // Jardim Vale do Sol
  ["Morumbi", "Sul"],               // Cidade Morumbi / Jardim Morumbi
  ["Jardim Morumbi", "Sul"],        // bairro real fora da lista oficial
  ["Jardim Primavera", "Sul"],      // bairro real fora da lista oficial (zona Sul)
  ["Parque Industrial SJC", "Sul"], // Parque Industrial (sufixo "SJC")
  // Leste
  ["Nova Michigan", "Leste"],       // Jardim/Nova Michigan
  ["Galo Branco", "Leste"],         // Res. Galo Branco
  ["Jardim Paineiras", "Leste"],    // Jardim das Paineiras II
  ["Jardim Paineiras II", "Leste"],
  ["Jardim Paineiras lI", "Leste"], // typo real "lI" no lugar de "II"
  ["Jardim das Paineiras", "Leste"],
  ["Jardim das Paineiras II", "Leste"],
  ["Setville", "Leste"],            // Setville Altos de São José (fora da lista oficial)
  ["Set Ville", "Leste"],
  ["Setville Altos de São José", "Leste"],
  ["Novo Horizonte", "Leste"],      // Parque Novo Horizonte
  ["Parque Novo Horizonte", "Leste"],
  ["Mantiqueira", "Leste"],         // Mantiqueira I/II
  ["Residencial Mantiqueira", "Leste"],
  // Sudeste
  ["CTA", "Sudeste"],               // DCTA
  ["DCTA", "Sudeste"],
  ["Campus do CTA", "Sudeste"],
  ["Santa Julia", "Sudeste"],       // Jardim Santa Julia
  ["São Judas Tadeu", "Sudeste"],   // Jardim/Conj. São Judas Tadeu
  // Oeste
  ["J das Industria", "Oeste"],     // Jardim das Indústrias
  ["Jardim das Industria", "Oeste"],
];

const ALIAS_INDEX: Map<string, Regiao> = (() => {
  const idx = new Map<string, Regiao>();
  for (const [variant, regiao] of ALIAS_SOURCE) {
    const key = bairroKey(variant);
    // Não sobrescreve o índice oficial; alias só preenche o que faltava.
    if (!BAIRRO_INDEX.has(key)) idx.set(key, regiao);
  }
  return idx;
})();

/* ── Casamento por NÚCLEO do nome (tolerante a prefixo/sufixo) ────────────────
 * "Entende correspondências": um bairro escrito SEM o descritor genérico
 * ("Betânia" → Vila Betânia, "Galo Branco" → Res. Galo Branco) casa pelo núcleo.
 *
 * Segurança (entrega física — não pode chutar região):
 *  - Só resolve quando TODAS as ocorrências do núcleo no índice apontam p/ UMA
 *    região (núcleo ambíguo entre regiões → manual).
 *  - Núcleo precisa ter ≥5 caracteres (evita "ema", "rubi"…).
 *  - CORE_BLOCK: núcleos genéricos OU que a verificação adversarial reprovou
 *    (índice tem um homônimo enganoso, mas o bairro real é de outra região/cidade).
 */
const STRIP_PREFIX = new Set([
  "vila", "jardim", "parque", "residencial", "conjunto", "condominio",
  "loteamento", "bosque", "chacara", "chacaras", "favela", "cidade",
  "projeto", "sitio", "habitacional", "recanto", "fazenda",
]);

const CORE_BLOCK = new Set([
  // reprovados pela verificação (índice tem homônimo, bairro real é ambíguo/fora)
  "floresta", "sao pedro", "planalto", "iracema",
  // genéricos / colisão com cidade ou nome comum
  "sao paulo", "santos", "maria", "industrial", "imperial", "paulista",
]);

function coreKey(norm: string): string {
  let toks = norm.split(" ").filter(Boolean);
  while (toks.length > 1 && STRIP_PREFIX.has(toks[0])) toks.shift();
  const isNum = (t: string) => /^[0-9]+$/.test(t) || /^(i|ii|iii|iv|v|vi)$/.test(t);
  while (toks.length > 1 && isNum(toks[toks.length - 1])) toks.pop();
  return toks.join(" ");
}

const CORE_INDEX: Map<string, Regiao> = (() => {
  const acc = new Map<string, Set<Regiao>>();
  for (const [key, regiao] of BAIRRO_INDEX) {
    const core = coreKey(key);
    if (core.length < 5 || CORE_BLOCK.has(core)) continue;
    if (!acc.has(core)) acc.set(core, new Set());
    acc.get(core)!.add(regiao);
  }
  const idx = new Map<string, Regiao>();
  for (const [core, regioes] of acc) {
    if (regioes.size === 1) idx.set(core, [...regioes][0]); // só núcleos não-ambíguos
  }
  return idx;
})();

function regiaoPorNucleo(norm: string): Regiao | null {
  const core = coreKey(norm);
  if (core.length < 5 || CORE_BLOCK.has(core)) return null;
  return CORE_INDEX.get(core) ?? null;
}

function cep5(cep: string | null | undefined): string {
  const digits = String(cep ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

function regiaoPorCep(cep: string | null | undefined): Regiao | null {
  const key = cep5(cep);
  return key ? CEP5_REGIAO[key] ?? null : null;
}

/**
 * Resolve a região de SJC a partir do bairro (principal) e CEP (reforço).
 *
 * @param bairro - Nome do bairro (pode vir com erro de digitação / vazio)
 * @param cep    - CEP com ou sem máscara (opcional, usado p/ desempate)
 */
export function resolveRegion(
  bairro: string | null | undefined,
  cep?: string | null
): RegionResult {
  const norm = bairroKey(bairro);

  // 1. Bairro reconhecido (match exato após normalizar + expandir abreviações)
  if (norm && BAIRRO_INDEX.has(norm)) {
    const regiao = BAIRRO_INDEX.get(norm)!;
    const ambiguo = BAIRROS_AMBIGUOS.has(norm);

    if (ambiguo) {
      // tenta desempatar / confirmar pelo CEP
      const porCep = regiaoPorCep(cep);
      if (porCep) {
        return { regiao: porCep, confidence: "media", method: "ambiguo-cep", matchedBairro: norm };
      }
      return { regiao, confidence: "baixa", method: "bairro", matchedBairro: norm };
    }

    return { regiao, confidence: "alta", method: "bairro", matchedBairro: norm };
  }

  // 1.4 Alias curado (variante verificada: prefixo omitido, abreviação, ou
  //     bairro real fora da lista oficial das 6 regiões).
  if (norm && ALIAS_INDEX.has(norm)) {
    return { regiao: ALIAS_INDEX.get(norm)!, confidence: "media", method: "alias", matchedBairro: norm };
  }

  // 1.45 Núcleo do nome (prefixo genérico omitido): "Betânia" → Vila Betânia.
  if (norm) {
    const porNucleo = regiaoPorNucleo(norm);
    if (porNucleo) {
      return { regiao: porNucleo, confidence: "media", method: "alias", matchedBairro: norm };
    }
  }

  // 1.5 Casamento aproximado (typo/abreviação não mapeada): ex. "Barrinho".
  if (norm) {
    const aprox = fuzzyRegion(norm);
    if (aprox) {
      return { regiao: aprox, confidence: "media", method: "fuzzy", matchedBairro: norm };
    }
  }

  // 2. Bairro vazio/desconhecido → CEP
  const porCep = regiaoPorCep(cep);
  if (porCep) {
    return { regiao: porCep, confidence: "media", method: "cep" };
  }

  // 3. Nada resolve
  return { regiao: null, confidence: "baixa", method: "indefinida", matchedBairro: norm || undefined };
}
