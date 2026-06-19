/**
 * POST /api/labels/status-by-leads
 *
 * Dado um conjunto de kommoLeadIds (lidos da etapa pelo widget), devolve o
 * status de etiqueta de cada um no banco. Usado pelo "Relatório do lote" pra
 * cruzar a etapa (Kommo) com o que foi gerado/impresso aqui — e descobrir o que
 * FALTA (inclusive leads que nunca geraram etiqueta, que não aparecem no banco).
 *
 * IMPORTANTE — escopo por etapa: o mesmo lead pode ter UMA MaterialRequest por
 * (lead, pipeline, stage) — ver @@unique no schema. Sem filtrar por etapa, um
 * lead impresso numa etapa ANTERIOR apareceria como "impresso" na etapa atual
 * (o RANK escolhe o melhor status entre as MRs do lead), MASCARANDO o que falta
 * imprimir aqui. Por isso, quando o widget envia kommoPipelineId+kommoStageId,
 * filtramos a MR pela etapa exata — aí há no máximo 1 MR por lead e o status é
 * o desta etapa. Sem esses campos, mantém o comportamento antigo (retrocompat).
 *
 * Payload: { secret, kommoLeadIds: (string|number)[], kommoPipelineId?, kommoStageId? }
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
  // Opcionais (retrocompat): quando presentes, restringem a busca à etapa exata
  // para não mascarar o status com etiquetas de outras etapas/pipelines do lead.
  kommoPipelineId: z.union([z.string(), z.number()]).optional(),
  kommoStageId: z.union([z.string(), z.number()]).optional(),
});

// Desempate quando o lead tem MR em +1 etapa. Só atua no modo retrocompat (sem
// pipeline+stage); com escopo por etapa há no máximo 1 MR por lead.
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

  // Escopo por etapa (quando o widget envia pipeline+stage). Com os dois, a
  // @@unique([kommoLeadId, kommoPipelineId, kommoStageId]) garante <=1 MR por
  // lead — o status é exatamente o desta etapa, sem mascaramento cross-etapa.
  const stageScope: { kommoPipelineId?: string; kommoStageId?: string } = {};
  if (parsed.data.kommoPipelineId != null) stageScope.kommoPipelineId = String(parsed.data.kommoPipelineId);
  if (parsed.data.kommoStageId != null) stageScope.kommoStageId = String(parsed.data.kommoStageId);

  const reqs = await prisma.materialRequest.findMany({
    where: { kommoLeadId: { in: ids }, ...stageScope },
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
