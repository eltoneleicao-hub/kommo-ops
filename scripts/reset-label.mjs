import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const id = process.argv[2];

const before = await prisma.label.findUnique({
  where: { id },
  include: { MaterialRequest: true },
});

if (!before) {
  console.log(JSON.stringify({ found: false, id }, null, 2));
} else {
  const updated = await prisma.label.update({
    where: { id },
    data: { printStatus: "pendente", printedAt: null, errorMessage: null },
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        labelId: id,
        recipientName: before.MaterialRequest?.recipientName ?? null,
        statusBefore: before.printStatus,
        statusAfter: updated.printStatus,
      },
      null,
      2
    )
  );
}
await prisma.$disconnect();
