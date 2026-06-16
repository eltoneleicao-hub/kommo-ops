import { NextResponse } from "next/server";
import { z } from "zod";
import { renderLabelText, validateLabelInput } from "@/domain/labels";
import { getRequestStatusForMissingFields } from "@/domain/requests";
import { prisma } from "@/lib/prisma";

const requiredIdentityField = z.string().trim().min(1);
const optionalTextField = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const requestPayloadSchema = z.object({
  secret: requiredIdentityField,
  kommoLeadId: requiredIdentityField,
  kommoContactId: optionalTextField,
  kommoPipelineId: requiredIdentityField,
  kommoStageId: requiredIdentityField,
  recipientName: optionalTextField,
  recipientPhone: optionalTextField,
  street: optionalTextField,
  number: optionalTextField,
  neighborhood: optionalTextField,
  postalCode: optionalTextField,
  city: optionalTextField,
  complement: optionalTextField,
  internalOrderNotes: optionalTextField,
  kommoUrl: optionalTextField,
  deductStock: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const parsedPayload = requestPayloadSchema.safeParse(await request.json().catch(() => null));

  if (!parsedPayload.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const payload = parsedPayload.data;
  const webhookSecret = process.env.KOMMO_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (payload.secret !== webhookSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const labelInput = {
    recipientName: payload.recipientName,
    recipientPhone: payload.recipientPhone,
    street: payload.street,
    number: payload.number,
    neighborhood: payload.neighborhood,
    postalCode: payload.postalCode,
    city: payload.city,
    complement: payload.complement,
    internalOrderNotes: payload.internalOrderNotes,
  };
  const missingFields = validateLabelInput(labelInput);
  const requestStatus = getRequestStatusForMissingFields(missingFields);

  const result = await prisma.$transaction(async (tx) => {
    const kommoKey = {
      kommoLeadId: payload.kommoLeadId,
      kommoPipelineId: payload.kommoPipelineId,
      kommoStageId: payload.kommoStageId,
    };
    const existingMaterialRequest = await tx.materialRequest.findUnique({
      where: { kommoLeadId_kommoPipelineId_kommoStageId: kommoKey },
      include: { Label: true },
    });

    if (
      existingMaterialRequest?.status === "impresso" ||
      (missingFields.length === 0 && existingMaterialRequest?.Label)
    ) {
      return {
        requestId: existingMaterialRequest.id,
        status: existingMaterialRequest.status,
        missingFields: existingMaterialRequest.missingFields,
        labelId: existingMaterialRequest.Label?.id ?? null,
        stockDeducted: false,
      };
    }

    const materialRequest = await tx.materialRequest.upsert({
      where: { kommoLeadId_kommoPipelineId_kommoStageId: kommoKey },
      create: {
        source: "kommo",
        kommoLeadId: payload.kommoLeadId,
        kommoContactId: payload.kommoContactId,
        kommoPipelineId: payload.kommoPipelineId,
        kommoStageId: payload.kommoStageId,
        status: requestStatus,
        missingFields,
        recipientName: payload.recipientName,
        recipientPhone: payload.recipientPhone,
        street: payload.street,
        number: payload.number,
        neighborhood: payload.neighborhood,
        postalCode: payload.postalCode,
        city: payload.city,
        complement: payload.complement,
        internalOrderNotes: payload.internalOrderNotes,
        kommoUrl: payload.kommoUrl,
      },
      update: {
        kommoContactId: payload.kommoContactId,
        status: requestStatus,
        missingFields,
        recipientName: payload.recipientName,
        recipientPhone: payload.recipientPhone,
        street: payload.street,
        number: payload.number,
        neighborhood: payload.neighborhood,
        postalCode: payload.postalCode,
        city: payload.city,
        complement: payload.complement,
        internalOrderNotes: payload.internalOrderNotes,
        kommoUrl: payload.kommoUrl,
      },
    });

    if (missingFields.length > 0) {
      return {
        requestId: materialRequest.id,
        status: requestStatus,
        missingFields,
        labelId: null,
        stockDeducted: false,
      };
    }

    const existingLabel = await tx.label.findUnique({
      where: { requestId: materialRequest.id },
    });

    if (existingLabel) {
      return {
        requestId: materialRequest.id,
        status: materialRequest.status,
        missingFields: materialRequest.missingFields,
        labelId: existingLabel.id,
        stockDeducted: false,
      };
    }

    const label = await tx.label.upsert({
      where: { requestId: materialRequest.id },
      create: {
        requestId: materialRequest.id,
        format: "text",
        content: renderLabelText(labelInput),
      },
      update: {},
    });

    const updatedRequest =
      materialRequest.status === "etiqueta_gerada"
        ? materialRequest
        : await tx.materialRequest.update({
            where: { id: materialRequest.id },
            data: { status: "etiqueta_gerada" },
          });

    // Dedução de estoque — atomica dentro da mesma transação
    let stockDeducted = false;
    if (payload.deductStock) {
      const sku = process.env.STOCK_PRODUCT_SKU;
      const locationName = process.env.STOCK_LOCATION_NAME;

      if (sku && locationName) {
        const [product, location] = await Promise.all([
          tx.product.findUnique({ where: { sku } }),
          tx.stockLocation.findFirst({ where: { name: locationName, active: true } }),
        ]);

        if (!product || !location) {
          throw new Error(`Estoque não configurado corretamente (SKU: ${sku}, Local: ${locationName})`);
        }

        const updated = await tx.stockBalance.updateMany({
          where: {
            productId: product.id,
            locationId: location.id,
            availableQty: { gte: 1 },
          },
          data: { availableQty: { decrement: 1 } },
        });

        if (updated.count === 0) {
          const balance = await tx.stockBalance.findUnique({
            where: { productId_locationId: { productId: product.id, locationId: location.id } },
          });
          throw new Error(
            `Estoque insuficiente. Disponível: ${balance?.availableQty ?? 0} convites`
          );
        }

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            locationId: location.id,
            type: "baixa",
            qty: 1,
            source: "kommo",
            sourceRef: payload.kommoLeadId,
            reason: "Etiqueta gerada via widget",
          },
        });

        stockDeducted = true;
      }
    }

    return {
      requestId: updatedRequest.id,
      status: updatedRequest.status,
      missingFields,
      labelId: label.id,
      stockDeducted,
    };
  });

  return NextResponse.json(result);
}
