import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const requiredTextField = z.string().trim().min(1);

const productPayloadSchema = z.object({
  sku: requiredTextField,
  name: requiredTextField,
  category: requiredTextField,
  unit: requiredTextField,
  minStock: z.number().int().nonnegative(),
});

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: { balances: true },
  });

  return NextResponse.json(products);
}

export async function POST(request: Request) {
  const parsedPayload = productPayloadSchema.safeParse(await request.json().catch(() => null));

  if (!parsedPayload.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const product = await prisma.product.create({
      data: parsedPayload.data,
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "duplicate_sku" }, { status: 409 });
    }

    throw error;
  }
}
