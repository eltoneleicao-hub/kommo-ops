import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  if (body.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.label.update({
    where: { id: params.id },
    data: {
      printStatus: "impresso",
      printedAt: new Date(),
    },
  });

  return NextResponse.json({ status: "impresso" });
}
