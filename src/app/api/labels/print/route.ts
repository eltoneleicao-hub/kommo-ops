/**
 * POST /api/labels/print
 *
 * Imprime etiqueta via ZPL na Zebra ZD220T
 *
 * Payload:
 * {
 *   labelId: "label-123",
 *   secret: "api-key"
 * }
 *
 * Resposta:
 * {
 *   status: "enviado_para_impressora",
 *   labelId: "label-123",
 *   zplPreview: "https://labelary.com/viewer.html?..."
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { renderLabelZPL, validateZPL, previewZPLOnline } from "@/domain/zpl-printer";
import { normalizeAddressInput } from "@/domain/labels";
import { fixMojibake } from "@/domain/encoding";
import { sendToZebraPrinter } from "@/lib/printer-adapter";

const printPayloadSchema = z.object({
  labelId: z.string().min(1),
  secret: z.string().min(1),
  dryRun: z.boolean().optional().default(false), // true = só gera ZPL, não imprime
});

export async function POST(request: NextRequest) {
  const parsed = printPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Validar secret
  if (parsed.data.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { labelId, dryRun } = parsed.data;

    // 1. Buscar label no banco
    const label = await prisma.label.findUnique({
      where: { id: labelId },
      include: { MaterialRequest: true },
    });

    if (!label) {
      return NextResponse.json({ error: "label_not_found" }, { status: 404 });
    }

    if (!label.MaterialRequest) {
      return NextResponse.json({ error: "request_not_found" }, { status: 404 });
    }

    // 2. Montar dados de entrada para ZPL
    const input = {
      recipientName: label.MaterialRequest.recipientName,
      recipientPhone: label.MaterialRequest.recipientPhone,
      street: label.MaterialRequest.street,
      number: label.MaterialRequest.number,
      neighborhood: label.MaterialRequest.neighborhood,
      postalCode: label.MaterialRequest.postalCode,
      city: label.MaterialRequest.city,
      complement: label.MaterialRequest.complement,
      internalOrderNotes: label.MaterialRequest.internalOrderNotes,
    };

    // 3. Normalizar endereço (fallback para campos combinados)
    const normalized = normalizeAddressInput(input);

    // 4. Gerar ZPL
    const zplContent = renderLabelZPL(normalized);

    // 5. Validar ZPL
    if (!validateZPL(zplContent)) {
      throw new Error("Generated ZPL is invalid");
    }

    // 6. Se dryRun, retornar preview sem imprimir
    if (dryRun) {
      return NextResponse.json({
        status: "dry_run",
        labelId,
        zplContent,
        preview: previewZPLOnline(zplContent),
        _debug: {
          marker: "MOJIBAKE_FIX_v1",
          rawCity: label.MaterialRequest.city,
          fixedCity: fixMojibake(label.MaterialRequest.city),
        },
      });
    }

    // 7. Enviar para impressora Zebra
    const printMode = process.env.PRINT_MODE || "direct"; // "direct" ou "file"
    await sendToZebraPrinter(zplContent, labelId, printMode);

    // 8. Atualizar status no banco
    await prisma.label.update({
      where: { id: labelId },
      data: {
        printStatus: "impresso",
        printedAt: new Date(),
      },
    });

    // 9. Log de sucesso
    console.log(`[Print] Etiqueta ${labelId} enviada para impressora`);

    const origin = request.headers.get("origin");
    const response = NextResponse.json({
      status: "enviado_para_impressora",
      labelId,
      printedAt: new Date().toISOString(),
      printer: "Zebra ZD220T",
      printMode,
    });

    // CORS Headers
    response.headers.set("Access-Control-Allow-Origin", origin || "*");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return response;
  } catch (error) {
    console.error("[Print] Erro:", error);

    const origin = request.headers.get("origin");
    const response = NextResponse.json(
      {
        error: "print_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );

    response.headers.set("Access-Control-Allow-Origin", origin || "*");
    return response;
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
