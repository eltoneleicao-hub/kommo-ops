import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Reivindicação ATÔMICA: pendente -> processando numa única query condicional.
  // Evita a race do findUnique+update (dois agentes não pegam a mesma etiqueta).
  // count === 1 => este request reivindicou; count === 0 => não estava pendente.
  const claimed = await prisma.label.updateMany({
    where: { id, printStatus: "pendente" },
    data: { printStatus: "processando" },
  });

  if (claimed.count === 1) {
    return NextResponse.json({ status: "processando" });
  }

  // Não reivindicou: descobre por quê (não existe / já terminou / já em curso).
  const label = await prisma.label.findUnique({ where: { id } });

  if (!label) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (label.printStatus === "impresso" || label.printStatus === "erro") {
    return NextResponse.json(
      { error: "already_processed", status: label.printStatus },
      { status: 409 }
    );
  }

  // Só resta "processando": outro agente (ou o reaper→reimpressão) já está com ela.
  return NextResponse.json({ status: "processando", alreadyClaimed: true });
}
