/**
 * Endpoint: POST /api/kommo/requests-batch
 *
 * Gera etiquetas em lote para todos os leads de uma etapa específica
 * que ainda não foram processados.
 *
 * Payload:
 * {
 *   secret: "api-key",
 *   kommoPipelineId: "123",
 *   kommoStageId: "456"
 * }
 *
 * Resposta:
 * {
 *   generated: 5,
 *   incomplete: 2,
 *   total: 7,
 *   results: [
 *     { kommoLeadId: "123", status: "etiqueta_gerada", labelId: "..." },
 *     { kommoLeadId: "124", status: "campos_incompletos", missingFields: [...] },
 *     ...
 *   ]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { renderLabelText, validateLabelInput } from "@/domain/labels";
import { getRequestStatusForMissingFields } from "@/domain/requests";

const batchPayloadSchema = z.object({
  secret: z.string().min(1),
  kommoPipelineId: z.string().min(1),
  kommoStageId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = batchPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Validar secret
  if (parsed.data.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { kommoPipelineId, kommoStageId } = parsed.data;

    // Buscar todos os leads da etapa que ainda não foram processados
    const materialRequests = await prisma.materialRequest.findMany({
      where: {
        kommoPipelineId,
        kommoStageId,
        // Não processar leads já impressos para evitar duplicação
        status: {
          notIn: ["impresso", "cancelado"],
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const results = [];
    let generated = 0;
    let incomplete = 0;

    // Processar cada lead em lote
    for (const materialRequest of materialRequests) {
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

        // Se completo, gerar etiqueta
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

          const label = await prisma.label.create({
            data: {
              requestId: materialRequest.id,
              format: "text",
              content: labelContent,
            },
          });

          await prisma.materialRequest.update({
            where: { id: materialRequest.id },
            data: { status: "etiqueta_gerada" },
          });

          generated++;
          results.push({
            kommoLeadId: materialRequest.kommoLeadId,
            status: "etiqueta_gerada",
            labelId: label.id,
          });
        } else {
          // Incompleto: atualizar status mas não criar etiqueta
          await prisma.materialRequest.update({
            where: { id: materialRequest.id },
            data: {
              status: "campos_incompletos",
              missingFields,
            },
          });

          incomplete++;
          results.push({
            kommoLeadId: materialRequest.kommoLeadId,
            status: "campos_incompletos",
            missingFields,
          });
        }
      } catch (error) {
        console.error(
          `[Batch] Erro ao processar lead ${materialRequest.kommoLeadId}:`,
          error
        );
        results.push({
          kommoLeadId: materialRequest.kommoLeadId,
          status: "erro",
          error:
            error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }

    const origin = request.headers.get("origin");
    const response = NextResponse.json({
      generated,
      incomplete,
      total: generated + incomplete,
      results,
    });

    // CORS Headers
    response.headers.set("Access-Control-Allow-Origin", origin || "*");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    return response;
  } catch (error) {
    console.error("[Batch] Erro geral:", error);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}

/**
 * Handler OPTIONS para preflight CORS
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
