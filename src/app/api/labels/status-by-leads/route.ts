/**
 * POST /api/labels/status-by-leads
 *
 * Dado um conjunto de kommoLeadIds (lidos da etapa pelo widget), devolve o
 * status de etiqueta de cada um no banco. Usado pelo "Relatório do lote" pra
 * cruzar a etapa (Kommo) com o que foi gerado/impresso aqui — e descobrir o que
 * FALTA (inclusive leads que nunca geraram etiqueta, que não aparecem no banco).
 *
 * SEMÂNTICA — uma etiqueta por LEAD: a etiqueta é impressa UMA vez e o lead
 * avança no funil (ex.: vai p/ "etiqueta impressa conferida", outra etapa). Por
 * isso cruzamos SÓ por kommoLeadId, sem filtrar por etapa: se o lead já tem
 * etiqueta impressa em QUALQUER etapa, ele aparece "impresso" no relatório de
 * onde ele estiver agora. O RANK abaixo escolhe o melhor status entre as MRs do
 * lead (impresso vence). NÃO filtrar por (pipeline, stage) é proposital — senão
 * a etiqueta gerada numa etapa anterior "some" quando o lead muda de etapa.
 *
 * Payload: { secret, kommoLeadIds: (string|number)[] }
 * Resposta: { statuses: { [kommoLeadId]: { status, printedAt, errorMessage, regiao, missingFields } } }
 *   status: "impresso" | "pendente" | "processando" | "erro" | "sem_etiqueta"
 *   (leads ausentes do mapa = nunca geraram nada no banco → "não gerada")
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withCors, corsPreflight } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request.headers.get("origin"));
}

const payloadSchema = z.object({
  secret: z.string().min(1),
  kommoLeadIds: z.array(z.union([z.string(), z.number()])).min(1).max(5000),
});

// Uma etiqueta por lead: quando o lead tem MR em +1 etapa (gerou, avançou),
// escolhe o melhor status (impresso vence) — reflete "o lead já foi impresso?".
const RANK: Record<string, number> = {
  impresso: 5, processando: 4, pendente: 3, erro: 2, sem_etiqueta: 1,
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return withCors(NextResponse.json({ error: "invalid_payload" }, { status: 400 }), origin);
  }
  if (parsed.data.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return withCors(NextResponse.json({ error: "unauthorized" }, { status: 401 }), origin);
  }

  const ids = parsed.data.kommoLeadIds.map(String);

  // Cruza SÓ por lead (todas as MRs do lead, qualquer etapa) — ver semântica
  // "uma etiqueta por lead" no topo. O RANK colapsa p/ o melhor status.
  const reqs = await prisma.materialRequest.findMany({
    where: { kommoLeadId: { in: ids } },
    include: { Label: true },
  });

  const statuses: Record<string, {
    status: string;
    printedAt: string | null;
    errorMessage: string | null;
    regiao: string | null;
    missingFields: string[];
  }> = {};

  for (const r of reqs) {
    if (!r.kommoLeadId) continue;
    const status = r.Label?.printStatus ?? "sem_etiqueta";
    const entry = {
      status,
      printedAt: r.Label?.printedAt ? r.Label.printedAt.toISOString() : null,
      errorMessage: r.Label?.errorMessage ?? null,
      regiao: r.internalOrderNotes ?? null,
      missingFields: r.missingFields ?? [],
    };
    const prev = statuses[r.kommoLeadId];
    if (!prev || (RANK[status] ?? 0) > (RANK[prev.status] ?? 0)) {
      statuses[r.kommoLeadId] = entry;
    }
  }

  return withCors(NextResponse.json({ statuses }), origin);
}
