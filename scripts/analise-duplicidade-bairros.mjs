/**
 * analise-duplicidade-bairros.mjs
 *
 * Lê region-resolver.ts, extrai os bairros de cada região e procura DUPLICIDADES:
 *  (A) mesmo NÚCLEO de nome em regiões DIFERENTES  → core matching fica desligado
 *      (cai em manual) e/ou pode haver classificação errada — é o caso "Bandeirantes".
 *  (B) mesmo NÚCLEO na MESMA região, prefixos diferentes (Vila X / Jardim X) → ok, FYI.
 *  (C) nome COMPLETO idêntico em 2+ regiões → conflito real no índice.
 *
 * Replica normalizeBairro + expandAbbrev + coreKey EXATAMENTE como no resolver.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "domain", "region-resolver.ts");
const src = readFileSync(SRC, "utf8");

/* ── lógica copiada do resolver ─────────────────────────────────────────── */
const ABBREV = {
  jd: "jardim", jrd: "jardim", jdm: "jardim", jardin: "jardim",
  vl: "vila", villa: "vila",
  pq: "parque", bq: "bosque", bsq: "bosque",
  res: "residencial", resid: "residencial",
  cj: "conjunto", conj: "conjunto",
  hab: "habitacional", cond: "condominio", chac: "chacara",
  faz: "fazenda", fzd: "fazenda", pres: "presidente",
  sta: "santa", sto: "santo", pe: "padre", dr: "doutor", eng: "engenheiro",
  soa: "sao",
};
const STRIP_PREFIX = new Set([
  "vila", "jardim", "parque", "residencial", "conjunto", "condominio",
  "loteamento", "bosque", "chacara", "chacaras", "favela", "cidade",
  "projeto", "sitio", "habitacional", "recanto", "fazenda",
]);
const normalizeBairro = (v) =>
  String(v ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const expandAbbrev = (norm) =>
  !norm ? norm : norm.split(" ").map((t) => ABBREV[t] ?? t).join(" ");
const bairroKey = (v) => expandAbbrev(normalizeBairro(v));
const coreKey = (norm) => {
  let toks = norm.split(" ").filter(Boolean);
  while (toks.length > 1 && STRIP_PREFIX.has(toks[0])) toks.shift();
  const isNum = (t) => /^[0-9]+$/.test(t) || /^(i|ii|iii|iv|v|vi)$/.test(t);
  while (toks.length > 1 && isNum(toks[toks.length - 1])) toks.pop();
  return toks.join(" ");
};

/* ── extrai BAIRROS_POR_REGIAO e BAIRROS_EXTRA do fonte ─────────────────── */
function extractRecord(name) {
  const start = src.indexOf(`const ${name}: Record<Regiao, string[]> = {`);
  if (start < 0) throw new Error(`não achei ${name}`);
  // acha o fechamento "};" do objeto
  let i = src.indexOf("{", start);
  let depth = 0, end = -1;
  for (let p = i; p < src.length; p++) {
    if (src[p] === "{") depth++;
    else if (src[p] === "}") { depth--; if (depth === 0) { end = p; break; } }
  }
  const body = src.slice(i + 1, end);
  const out = {};
  const re = /(\w+):\s*\[([\s\S]*?)\],?\s*(?=\w+:\s*\[|$)/g;
  let m;
  while ((m = re.exec(body))) {
    const regiao = m[1];
    const items = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    out[regiao] = items;
  }
  return out;
}

const principal = extractRecord("BAIRROS_POR_REGIAO");
const extra = extractRecord("BAIRROS_EXTRA");

/* ── monta índice: core -> Map<regiao, [nomes...]> ──────────────────────── */
const byCore = new Map();   // core -> Map<regiao, Set<nomeOriginal>>
const byFull = new Map();   // bairroKey -> Map<regiao, Set<nomeOriginal>>
const add = (regiao, nome) => {
  const full = bairroKey(nome);
  const core = coreKey(full);
  if (!byCore.has(core)) byCore.set(core, new Map());
  if (!byCore.get(core).has(regiao)) byCore.get(core).set(regiao, new Set());
  byCore.get(core).get(regiao).add(nome);
  if (!byFull.has(full)) byFull.set(full, new Map());
  if (!byFull.get(full).has(regiao)) byFull.get(full).set(regiao, new Set());
  byFull.get(full).get(regiao).add(nome);
};
for (const [r, arr] of Object.entries(principal)) arr.forEach((n) => add(r, n));
for (const [r, arr] of Object.entries(extra)) arr.forEach((n) => add(r, n));

/* ── (C) nome completo idêntico em 2+ regiões ───────────────────────────── */
const fullConflicts = [...byFull.entries()].filter(([, regs]) => regs.size > 1);

/* ── (A) núcleo em regiões diferentes ───────────────────────────────────── */
const coreConflicts = [...byCore.entries()]
  .filter(([core, regs]) => regs.size > 1 && core.length >= 5)
  .sort((a, b) => a[0].localeCompare(b[0]));

/* ── (B) núcleo repetido na mesma região (prefixos diferentes) FYI ──────── */
const sameRegionMultiPrefix = [...byCore.entries()]
  .filter(([core, regs]) => {
    if (regs.size !== 1) return false;
    const nomes = [...regs.values()][0];
    return nomes.size > 1 && core.length >= 5;
  });

/* ── saída ──────────────────────────────────────────────────────────────── */
const fmt = (regs) =>
  [...regs.entries()]
    .map(([r, nomes]) => `${r} {${[...nomes].join(" | ")}}`)
    .join("   vs   ");

console.log("═".repeat(78));
console.log("(A) NÚCLEO em REGIÕES DIFERENTES  ← duplicidades que importam");
console.log("    (core matching fica DESLIGADO p/ esses → 'Núcleo' sozinho vai p/ manual)");
console.log("═".repeat(78));
if (!coreConflicts.length) console.log("  (nenhum)");
for (const [core, regs] of coreConflicts) {
  console.log(`\n• núcleo "${core}"`);
  console.log(`    ${fmt(regs)}`);
}

console.log("\n" + "═".repeat(78));
console.log("(C) NOME COMPLETO idêntico em 2+ regiões  ← conflito direto no índice");
console.log("═".repeat(78));
if (!fullConflicts.length) console.log("  (nenhum)");
for (const [full, regs] of fullConflicts) {
  console.log(`\n• "${full}"`);
  console.log(`    ${fmt(regs)}`);
}

console.log("\n" + "═".repeat(78));
console.log(`(B) MESMO núcleo, MESMA região, prefixos diferentes (${sameRegionMultiPrefix.length}) — só FYI`);
console.log("═".repeat(78));
for (const [core, regs] of sameRegionMultiPrefix) {
  const nomes = [...[...regs.values()][0]];
  console.log(`  • "${core}": ${nomes.join(" | ")}  → ${[...regs.keys()][0]}`);
}

console.log("\n" + "─".repeat(78));
console.log(`Resumo: ${coreConflicts.length} colisões de núcleo (A) · ${fullConflicts.length} nomes completos duplicados (C) · ${sameRegionMultiPrefix.length} multi-prefixo same-region (B)`);
