/**
 * Test d'isolation tenant (PROMPTMVP.md section 138).
 *
 * Crée un second établissement concurrent, puis vérifie que :
 *   1. sans contexte tenant, aucune ligne n'est visible ;
 *   2. avec le contexte de l'hôtel A, seules les lignes de A le sont ;
 *   3. un hôtel B ne peut lire aucune donnée de l'hôtel A, y compris en
 *      forgeant un identifiant de propriété.
 *
 * Usage : npx tsx prisma/verify-tenant-isolation.ts
 *
 * Ce script ne modifie que ses propres données de test et les supprime à la
 * fin. Il ne doit jamais être exécuté en production.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SUFFIX = "Isolation Test";

async function main(): Promise<void> {
  const orgA = await prisma.organization.findFirst({
    where: { name: { not: { contains: SUFFIX } } },
    orderBy: { createdAt: "asc" },
  });

  if (!orgA) {
    throw new Error("Exécutez d'abord `npm run db:seed` pour disposer d'une organisation de référence.");
  }

  const orgB = await prisma.organization.create({
    data: {
      name: `Hôtel Concurrent ${SUFFIX}`,
      slug: `isolation-test-${Date.now()}`,
      defaultCurrency: "XOF",
      countryCode: "CI",
    },
  });

  // La création s'effectue dans un contexte tenant explicite : sans lui, le
  // RLS refuse l'écriture. C'est le premier contrôle qui s'exerce en
  // pratique.
  const propertyB = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgB.id}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${""}, true)`;

    return tx.property.create({
      data: {
        organizationId: orgB.id,
        name: `Propriété B ${SUFFIX}`,
        code: "ISO-B",
        slug: `iso-b-${Date.now()}`,
        status: "ACTIVE",
      },
    });
  });

  // Données distinctes pour chaque organisation, afin de mesurer ce que
  // chacune voit réellement. La lecture de A se fait dans le contexte de A :
  // sans cela, le RLS la refuse, ce qui est le comportement attendu.
  const propertyA = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgA.id}, true)`;

    return tx.property.findFirstOrThrow({
      where: { organizationId: orgA.id },
      orderBy: { createdAt: "asc" },
    });
  });

  // Les données de test sont créées dans le contexte de B.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgB.id}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${propertyB.id}, true)`;

    const roomType = await tx.roomType.create({
      data: {
        propertyId: propertyB.id,
        name: "Chambre test B",
        code: "TST-B",
        maxOccupancy: 2,
        baseOccupancy: 2,
      },
    });

    await tx.room.create({
      data: {
        propertyId: propertyB.id,
        roomTypeId: roomType.id,
        number: "001",
        code: "ISO-B-001",
      },
    });
  });

  console.log(`Organisation A : ${orgA.name}`);
  console.log(`Organisation B : ${orgB.name}`);
  console.log("");

  // --- 1. Sans contexte tenant --------------------------------------------
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${""}, true)`;

    const visibleProperties = await tx.property.count();
    const visibleRooms = await tx.room.count();

    console.log("1. Sans contexte tenant (aucune session ouverte)");
    console.log(`   propriétés visibles : ${visibleProperties}`);
    console.log(`   chambres visibles   : ${visibleRooms}`);

    if (visibleProperties !== 0 || visibleRooms !== 0) {
      throw new Error(
        "FUITE : des lignes sont visibles sans contexte tenant. " +
          "Le RLS doit renvoyer zéro ligne, jamais toutes les lignes.",
      );
    }
    console.log("   -> aucune ligne visible, conforme\n");
  });

  // --- 2. Contexte de l'organisation A ------------------------------------
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgA.id}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${propertyA.id}, true)`;

    const propertiesA = await tx.property.findMany({ select: { name: true } });
    const roomsA = await tx.room.count();

    console.log(`2. Contexte de l'hôtel A (${propertyA.name})`);
    console.log(`   propriétés visibles : ${propertiesA.length}`);
    console.log(`   chambres visibles   : ${roomsA}`);

    const seesPropertyB = propertiesA.some((property) => property.name === propertyB.name);
    if (seesPropertyB) {
      throw new Error("FUITE : l'hôtel A voit la propriété de l'hôtel B.");
    }
    console.log("   -> la propriété B est invisible, conforme\n");
  });

  // --- 3. Attaque : contexte B tentant de lire les données de A ----------
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${orgB.id}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${propertyB.id}, true)`;

    // Requête volontairement forgée : l'attaquant connaît l'identifiant de
    // la propriété A et tente de lire ses chambres.
    const forgedRooms = await tx.room.count({ where: { propertyId: propertyA.id } });
    const allRooms = await tx.room.count();

    console.log(`3. Attaque : contexte B cherchant les chambres de la propriété A`);
    console.log(`   chambres A trouvées par identifiant forgé : ${forgedRooms}`);
    console.log(`   chambres visibles depuis le contexte B      : ${allRooms}`);

    if (forgedRooms !== 0) {
      throw new Error("FUITE : le RLS n'empêche pas la lecture par identifiant forgé.");
    }
    if (allRooms !== 1) {
      throw new Error(`Attendu : 1 chambre (celle de B), obtenu ${allRooms}.`);
    }
    console.log("   -> l'identifiant forgé ne retourne rien, conforme\n");
  });

  console.log("Isolation multi-tenant vérifiée sur les trois scénarios.");
}

main()
  .catch((error) => {
    console.error("\nÉCHEC :", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Nettoyage des données de test, dans l'ordre des dépendances.
    await prisma.organization.deleteMany({ where: { name: { contains: SUFFIX } } }).catch(() => undefined);
    await prisma.$disconnect();
  });