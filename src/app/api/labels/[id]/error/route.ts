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

  const errorMessage = typeof body.errorMessage === "string"
    ? body.errorMessage.slice(0, 500)
    : "Erro desconhecido";

  await prisma.label.update({
    where: { id },
    data: { printStatus: "erro", errorMessage },
  });

  return NextResponse.json({ status: "erro", errorMessage });
}
