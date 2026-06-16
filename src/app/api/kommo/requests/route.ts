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
      where: {
        kommoLeadId_kommoPipelineId_kommoStageId: kommoKey,
      },
      include: {
        Label: true,
      },
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
      };
    }

    const materialRequest = await tx.materialRequest.upsert({
      where: {
        kommoLeadId_kommoPipelineId_kommoStageId: kommoKey,
      },
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
      };
    }

    const label = await tx.label.upsert({
      where: {
        requestId: materialRequest.id,
      },
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

    return {
      requestId: updatedRequest.id,
      status: updatedRequest.status,
      missingFields,
      labelId: label.id,
    };
  });

  return NextResponse.json(result);
}
