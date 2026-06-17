/**
 * POST /api/region/resolve-batch
 *
 * Versão em lote do /api/region/resolve: recebe uma lista de leads (id +
 * bairro/CEP) e devolve a região resolvida de cada um. Usado pelo botão
 * "Definir Região (Lote)" do widget, que lê os leads direto do Kommo e precisa
 * resolver centenas de regiões numa única chamada (o mapa de bairros fica no
 * backend, não é exposto no front).
 *
 * Payload: { secret, items: [{ id, bairro?, cep? }] }
 * Resposta: { results: [{ id, regiao, confidence, method }] }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { resolveRegion } from "@/domain/region-resolver";
import { withCors, corsPreflight } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request.headers.get("origin"));
}

const payloadSchema = z.object({
  secret: z.string().min(1),
  items: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        bairro: z.string().optional(),
        cep: z.string().optional(),
      }),
    )
    .max(5000),
});

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return withCors(NextResponse.json({ error: "invalid_payload" }, { status: 400 }), origin);
  }

  if (parsed.data.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return withCors(NextResponse.json({ error: "unauthorized" }, { status: 401 }), origin);
  }

  const results = parsed.data.items.map((it) => {
    const resolved = resolveRegion(it.bairro, it.cep);
    return {
      id: String(it.id),
      regiao: resolved.regiao,
      confidence: resolved.confidence,
      method: resolved.method,
    };
  });

  return withCors(NextResponse.json({ results }), origin);
}
