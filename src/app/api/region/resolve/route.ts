/**
 * POST /api/region/resolve
 *
 * Resolve a região administrativa de São José dos Campos a partir do
 * bairro (principal) e CEP (reforço). A lógica fica no backend para que o
 * mapa de bairros não seja exposto no front e possa ser ajustado sem
 * re-upload do widget.
 *
 * Payload: { secret, bairro?, cep? }
 * Resposta: { regiao, confidence, method }
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
  bairro: z.string().optional(),
  cep: z.string().optional(),
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

  const result = resolveRegion(parsed.data.bairro, parsed.data.cep);

  return withCors(NextResponse.json(result), origin);
}
