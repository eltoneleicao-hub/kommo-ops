import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  if (secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const labels = await prisma.label.findMany({
    where: { printStatus: "pendente" },
    include: { MaterialRequest: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  const result = labels.map((label) => ({
    id: label.id,
    content: label.content,
    recipientName: label.MaterialRequest?.recipientName ?? "",
    street: label.MaterialRequest?.street ?? "",
    number: label.MaterialRequest?.number ?? "",
    complement: label.MaterialRequest?.complement ?? "",
    neighborhood: label.MaterialRequest?.neighborhood ?? "",
    city: label.MaterialRequest?.city ?? "",
    postalCode: label.MaterialRequest?.postalCode ?? "",
    recipientPhone: label.MaterialRequest?.recipientPhone ?? "",
    internalOrderNotes: label.MaterialRequest?.internalOrderNotes ?? "",
  }));

  return NextResponse.json(result);
}
