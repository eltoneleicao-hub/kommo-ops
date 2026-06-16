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

  if (label.printStatus === "processando") {
    return NextResponse.json({ status: "processando", alreadyClaimed: true });
  }

  await prisma.label.update({
    where: { id },
    data: { printStatus: "processando" },
  });

  return NextResponse.json({ status: "processando" });
}
