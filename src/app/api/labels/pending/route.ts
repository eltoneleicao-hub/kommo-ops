import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  if (secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const labels = await prisma.label.findMany({
    where: { printStatus: "pendente" },
    include: { request: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  const result = labels.map((label) => ({
    id: label.id,
    recipientName: label.request?.recipientName ?? "",
    street: label.request?.street ?? "",
    number: label.request?.number ?? "",
    complement: label.request?.complement ?? "",
    neighborhood: label.request?.neighborhood ?? "",
    city: label.request?.city ?? "",
    postalCode: label.request?.postalCode ?? "",
    recipientPhone: label.request?.recipientPhone ?? "",
    internalOrderNotes: label.request?.internalOrderNotes ?? "",
  }));

  return NextResponse.json(result);
}
