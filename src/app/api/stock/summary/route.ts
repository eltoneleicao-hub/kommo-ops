import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sku = process.env.STOCK_PRODUCT_SKU;
  const locationName = process.env.STOCK_LOCATION_NAME;

  if (!sku || !locationName) {
    return NextResponse.json({ configured: false, availableQty: 0 });
  }

  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    return NextResponse.json({ configured: false, availableQty: 0, error: "product_not_found" });
  }

  const location = await prisma.stockLocation.findFirst({
    where: { name: locationName, active: true },
  });
  if (!location) {
    return NextResponse.json({ configured: false, availableQty: 0, error: "location_not_found" });
  }

  const balance = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: product.id, locationId: location.id } },
  });

  return NextResponse.json({
    configured: true,
    productName: product.name,
    locationName: location.name,
    availableQty: balance?.availableQty ?? 0,
  });
}
