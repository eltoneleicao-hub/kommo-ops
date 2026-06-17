import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { renderLabelText, validateLabelInput } from "@/domain/labels";
import { getRequestStatusForMissingFields } from "@/domain/requests";
import { resolveRegion, normalizeBairro } from "@/domain/region-resolver";
import { withCors } from "@/lib/cors";

const batchPayloadSchema = z.object({
  secret: z.string().min(1),
  kommoPipelineId: z.string().min(1),
  kommoStageId: z.string().min(1),
  countOnly: z.boolean().optional().default(false),
  deductStock: z.boolean().optional().default(false),
  // Filtra o lote por região (resolvida do bairro/CEP). Omitido = todas.
  region: z.string().optional(),
  // Modo lista: devolve os candidatos (para seleção no widget), sem gerar.
  list: z.boolean().optional().default(false),
  // Seleção: gera apenas estes leads (por kommoLeadId). Omitido = todos.
  kommoLeadIds: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = batchPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (parsed.data.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { kommoPipelineId, kommoStageId, countOnly, deductStock, region, list, kommoLeadIds } = parsed.data;

  const allRequests = await prisma.materialRequest.findMany({
    where: {
      kommoPipelineId,
      kommoStageId,
      status: { notIn: ["impresso", "cancelado"] },
    },
    orderBy: { createdAt: "asc" },
  });

  // Filtra por região quando informada. Considera tanto a região ANOTADA no
  // lead (campo Região / anotações — o que sai na etiqueta) quanto a RESOLVIDA
  // do endereço (bairro/CEP), o que for mais abrangente.
  const wantRegion = normalizeBairro(region ?? "");
  const materialRequests = region
    ? allRequests.filter(
        (r) =>
          (wantRegion.length > 0 && normalizeBairro(r.internalOrderNotes).includes(wantRegion)) ||
          resolveRegion(r.neighborhood, r.postalCode).regiao === region,
      )
    : allRequests;

  const missingOf = (r: (typeof allRequests)[number]) =>
    validateLabelInput({
      recipientName: r.recipientName,
      recipientPhone: r.recipientPhone,
      street: r.street,
      number: r.number,
      neighborhood: r.neighborhood,
      postalCode: r.postalCode,
      city: r.city,
      complement: r.complement,
      internalOrderNotes: r.internalOrderNotes,
    });

  // Modo lista: devolve os candidatos para seleção no widget (não gera nada).
  if (list) {
    return withCors(
      NextResponse.json({
        total: materialRequests.length,
        leads: materialRequests.map((r) => {
          const missing = missingOf(r);
          const resolved = resolveRegion(r.neighborhood, r.postalCode);
          return {
            kommoLeadId: r.kommoLeadId,
            recipientName: r.recipientName ?? "",
            neighborhood: r.neighborhood ?? "",
            city: r.city ?? "",
            regiao: resolved.regiao,
            confidence: resolved.confidence,
            eligible: missing.length === 0,
            missingFields: missing,
          };
        }),
      }),
      request.headers.get("origin"),
    );
  }

  // Seleção: gera apenas os leads escolhidos (se a lista foi enviada).
  const toProcess =
    kommoLeadIds && kommoLeadIds.length
      ? materialRequests.filter((r) => r.kommoLeadId && kommoLeadIds.includes(r.kommoLeadId))
      : materialRequests;

  // Quantos dos que serão processados estão completos (contagem/estoque).
  const eligible = toProcess.filter((r) => missingOf(r).length === 0).length;

  if (countOnly) {
    return NextResponse.json({ eligible, total: toProcess.length });
  }

  // Verificar estoque antes de processar (se deductStock solicitado)
  if (deductStock && eligible > 0) {
    const sku = process.env.STOCK_PRODUCT_SKU;
    const locationName = process.env.STOCK_LOCATION_NAME;

    if (sku && locationName) {
      const product = await prisma.product.findUnique({ where: { sku } });
      const location = await prisma.stockLocation.findFirst({
        where: { name: locationName, active: true },
      });

      if (product && location) {
        const balance = await prisma.stockBalance.findUnique({
          where: { productId_locationId: { productId: product.id, locationId: location.id } },
        });
        const available = balance?.availableQty ?? 0;

        if (available < eligible) {
          return NextResponse.json(
            {
              error: "insufficient_stock",
              available,
              needed: eligible,
              message: `Estoque insuficiente. Disponível: ${available}, necessário: ${eligible}`,
            },
            { status: 409 }
          );
        }
      }
    }
  }

  const results = [];
  let generated = 0;
  let incomplete = 0;
  let stockDeducted = 0;

  for (const materialRequest of toProcess) {
    try {
      const missingFields = validateLabelInput({
        recipientName: materialRequest.recipientName,
        recipientPhone: materialRequest.recipientPhone,
        street: materialRequest.street,
        number: materialRequest.number,
        neighborhood: materialRequest.neighborhood,
        postalCode: materialRequest.postalCode,
        city: materialRequest.city,
        complement: materialRequest.complement,
        internalOrderNotes: materialRequest.internalOrderNotes,
      });

      const status = getRequestStatusForMissingFields(missingFields);

      if (missingFields.length === 0) {
        const labelContent = renderLabelText({
          recipientName: materialRequest.recipientName,
          recipientPhone: materialRequest.recipientPhone,
          street: materialRequest.street,
          number: materialRequest.number,
          neighborhood: materialRequest.neighborhood,
          postalCode: materialRequest.postalCode,
          city: materialRequest.city,
          complement: materialRequest.complement,
          internalOrderNotes: materialRequest.internalOrderNotes,
        });

        // Cria label + deduz estoque na mesma transação
        const label = await prisma.$transaction(async (tx) => {
          const existingLabel = await tx.label.findUnique({
            where: { requestId: materialRequest.id },
          });
          if (existingLabel) {
            // Reimpressão em lote: regenera conteúdo e devolve à fila (pendente),
            // sem deduzir estoque de novo.
            return tx.label.update({
              where: { id: existingLabel.id },
              data: {
                content: labelContent,
                printStatus: "pendente",
                printedAt: null,
                errorMessage: null,
              },
            });
          }

          const newLabel = await tx.label.create({
            data: {
              requestId: materialRequest.id,
              format: "text",
              content: labelContent,
            },
          });

          await tx.materialRequest.update({
            where: { id: materialRequest.id },
            data: { status: "etiqueta_gerada" },
          });

          if (deductStock) {
            const sku = process.env.STOCK_PRODUCT_SKU;
            const locationName = process.env.STOCK_LOCATION_NAME;
            if (sku && locationName) {
              const product = await tx.product.findUnique({ where: { sku } });
              const location = await tx.stockLocation.findFirst({
                where: { name: locationName, active: true },
              });
              if (product && location) {
                await tx.stockBalance.updateMany({
                  where: {
                    productId: product.id,
                    locationId: location.id,
                    availableQty: { gte: 1 },
                  },
                  data: { availableQty: { decrement: 1 } },
                });
                await tx.stockMovement.create({
                  data: {
                    productId: product.id,
                    locationId: location.id,
                    type: "baixa",
                    qty: 1,
                    source: "kommo",
                    sourceRef: materialRequest.kommoLeadId ?? materialRequest.id,
                    reason: "Etiqueta gerada via lote",
                  },
                });
                stockDeducted++;
              }
            }
          }

          return newLabel;
        });

        generated++;
        results.push({
          kommoLeadId: materialRequest.kommoLeadId,
          status: "etiqueta_gerada",
          labelId: label.id,
        });
      } else {
        await prisma.materialRequest.update({
          where: { id: materialRequest.id },
          data: { status: "campos_incompletos", missingFields },
        });
        incomplete++;
        results.push({
          kommoLeadId: materialRequest.kommoLeadId,
          status: "campos_incompletos",
          missingFields,
        });
      }
    } catch (error) {
      console.error(`[Batch] Erro ao processar lead ${materialRequest.kommoLeadId}:`, error);
      results.push({
        kommoLeadId: materialRequest.kommoLeadId,
        status: "erro",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }

  const origin = request.headers.get("origin");
  const response = NextResponse.json({
    generated,
    incomplete,
    total: generated + incomplete,
    stockDeducted,
    results,
  });

  response.headers.set("Access-Control-Allow-Origin", origin || "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return response;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
