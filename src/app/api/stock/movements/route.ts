import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { NegativeStockBalanceError, ProductOrLocationNotFoundError } from "@/domain/stock";
import { prisma } from "@/lib/prisma";

const requiredTextField = z.string().trim().min(1);
const optionalTextField = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const movementPayloadSchema = z.object({
  productId: requiredTextField,
  locationId: requiredTextField,
  type: z.enum(["entrada", "reserva", "baixa", "cancelamento_reserva", "ajuste"]),
  qty: z.number().int().positive(),
  reason: optionalTextField,
  source: optionalTextField,
  sourceRef: optionalTextField,
  createdBy: optionalTextField,
});

export async function POST(request: Request) {
  const parsedPayload = movementPayloadSchema.safeParse(await request.json().catch(() => null));

  if (!parsedPayload.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const movement = await prisma.$transaction(async (tx) => {
      const payload = parsedPayload.data;

      const [product, location] = await Promise.all([
        tx.product.findUnique({ where: { id: payload.productId }, select: { id: true } }),
        tx.stockLocation.findUnique({ where: { id: payload.locationId }, select: { id: true } }),
      ]);

      if (!product || !location) {
        throw new ProductOrLocationNotFoundError();
      }

      await tx.stockBalance.upsert({
        where: {
          productId_locationId: {
            productId: payload.productId,
            locationId: payload.locationId,
          },
        },
        create: {
          productId: payload.productId,
          locationId: payload.locationId,
          availableQty: 0,
          reservedQty: 0,
        },
        update: {},
      });

      if (payload.type === "entrada" || payload.type === "ajuste") {
        await tx.stockBalance.update({
          where: {
            productId_locationId: {
              productId: payload.productId,
              locationId: payload.locationId,
            },
          },
          data: {
            availableQty: { increment: payload.qty },
          },
        });
      }

      if (payload.type === "reserva") {
        const updated = await tx.stockBalance.updateMany({
          where: {
            productId: payload.productId,
            locationId: payload.locationId,
            availableQty: { gte: payload.qty },
          },
          data: {
            availableQty: { decrement: payload.qty },
            reservedQty: { increment: payload.qty },
          },
        });

        if (updated.count === 0) {
          throw new NegativeStockBalanceError();
        }
      }

      if (payload.type === "cancelamento_reserva") {
        const updated = await tx.stockBalance.updateMany({
          where: {
            productId: payload.productId,
            locationId: payload.locationId,
            reservedQty: { gte: payload.qty },
          },
          data: {
            availableQty: { increment: payload.qty },
            reservedQty: { decrement: payload.qty },
          },
        });

        if (updated.count === 0) {
          throw new NegativeStockBalanceError();
        }
      }

      if (payload.type === "baixa") {
        const updated = await tx.stockBalance.updateMany({
          where: {
            productId: payload.productId,
            locationId: payload.locationId,
            reservedQty: { gte: payload.qty },
          },
          data: {
            reservedQty: { decrement: payload.qty },
          },
        });

        if (updated.count === 0) {
          throw new NegativeStockBalanceError();
        }
      }

      return tx.stockMovement.create({
        data: {
          productId: payload.productId,
          locationId: payload.locationId,
          type: payload.type,
          qty: payload.qty,
          reason: payload.reason,
          source: payload.source ?? "manual",
          sourceRef: payload.sourceRef,
          createdBy: payload.createdBy,
        },
      });
    });

    return NextResponse.json(movement, { status: 201 });
  } catch (error) {
    if (
      error instanceof ProductOrLocationNotFoundError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2003" || error.code === "P2025"))
    ) {
      return NextResponse.json({ error: "product_or_location_not_found" }, { status: 404 });
    }

    if (error instanceof NegativeStockBalanceError) {
      return NextResponse.json({ error: "negative_balance" }, { status: 409 });
    }

    throw error;
  }
}
