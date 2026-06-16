import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withCors, corsPreflight } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return withCors(NextResponse.json({ error: "unauthorized" }, { status: 401 }), origin);
  }

  const sku = process.env.STOCK_PRODUCT_SKU;
  const locationName = process.env.STOCK_LOCATION_NAME;

  if (!sku || !locationName) {
    return withCors(NextResponse.json({ configured: false, availableQty: 0 }), origin);
  }

  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    return withCors(
      NextResponse.json({ configured: false, availableQty: 0, error: "product_not_found" }),
      origin
    );
  }

  const location = await prisma.stockLocation.findFirst({
    where: { name: locationName, active: true },
  });
  if (!location) {
    return withCors(
      NextResponse.json({ configured: false, availableQty: 0, error: "location_not_found" }),
      origin
    );
  }

  const balance = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: product.id, locationId: location.id } },
  });

  return withCors(
    NextResponse.json({
      configured: true,
      productName: product.name,
      locationName: location.name,
      availableQty: balance?.availableQty ?? 0,
    }),
    origin
  );
}
