import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

function authorized(secret: string | null) {
  return secret === process.env.KOMMO_WEBHOOK_SECRET;
}

export async function GET(request: NextRequest) {
  if (!authorized(request.nextUrl.searchParams.get("secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const locations = await prisma.stockLocation.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(locations);
}

const createSchema = z.object({
  secret: z.string().min(1),
  name: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  if (!authorized(body.data.secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const location = await prisma.stockLocation.create({ data: { name: body.data.name } });
  return NextResponse.json(location, { status: 201 });
}
