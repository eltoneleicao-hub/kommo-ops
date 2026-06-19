import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const id = process.argv[2];
const label = await prisma.label.findUnique({
  where: { id },
  include: { MaterialRequest: true },
});

if (!label) {
  console.log(JSON.stringify({ found: false, id }, null, 2));
} else {
  const r = label.MaterialRequest;
  console.log(
    JSON.stringify(
      {
        found: true,
        labelId: label.id,
        printStatus: label.printStatus,
        printedAt: label.printedAt,
        errorMessage: label.errorMessage,
        labelCreatedAt: label.createdAt,
        request: r && {
          id: r.id,
          recipientName: r.recipientName,
          recipientPhone: r.recipientPhone,
          street: r.street,
          number: r.number,
          neighborhood: r.neighborhood,
          city: r.city,
          postalCode: r.postalCode,
          complement: r.complement,
          regiao_internalOrderNotes: r.internalOrderNotes,
          status: r.status,
          missingFields: r.missingFields,
          kommoLeadId: r.kommoLeadId,
          kommoUrl: r.kommoUrl,
          createdAt: r.createdAt,
        },
      },
      null,
      2
    )
  );
}
await prisma.$disconnect();
