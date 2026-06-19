import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  if (secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Reaper: etiquetas presas em "processando" (o agente reivindicou e caiu antes
  // de marcar impresso/erro) voltam para "pendente" e são reimpressas na próxima
  // passada. Janela em minutos via REAP_PROCESSING_MINUTES (default 5) — uma
  // impressão normal leva segundos, então "processando" há minutos = órfã.
  const reapMinutes = Number(process.env.REAP_PROCESSING_MINUTES) || 5;
  const cutoff = new Date(Date.now() - reapMinutes * 60_000);
  await prisma.label.updateMany({
    where: { printStatus: "processando", updatedAt: { lt: cutoff } },
    data: { printStatus: "pendente" },
  });

  const labels = await prisma.label.findMany({
    where: { printStatus: "pendente" },
    include: { MaterialRequest: true },
    orderBy: { createdAt: "asc" },
    take: 50,
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
