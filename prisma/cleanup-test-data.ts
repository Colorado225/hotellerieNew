import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Supprime les organisations créées par le test d'isolation.
 * Usage : npx tsx prisma/cleanup-test-data.ts
 */
async function main(): Promise<void> {
  const organizations = await prisma.organization.findMany({
    where: { name: { contains: "Isolation" } },
    select: { id: true, name: true },
  });

  for (const organization of organizations) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
      await tx.property.deleteMany({ where: { organizationId: organization.id } });
      await tx.organization.delete({ where: { id: organization.id } });
    });
    console.log("Supprimée :", organization.name);
  }

  console.log(`Organisations restantes : ${await prisma.organization.count()}`);
}

main()
  .catch((error) => {
    console.error("Échec du nettoyage :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });