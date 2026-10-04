/**
 * Seed de démonstration LagoonKey (PROMPTMVP.md section 77).
 *
 * Règles strictes :
 *   - Le seed est totalement isolé des données réelles.
 *   - Il ne s'exécute JAMAIS automatiquement en production (section 130).
 *
 * Usage : npm run db:seed
 */

import { HotelClassification, Prisma, PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/modules/auth/password";

const prisma = new PrismaClient();

const DEMO_ORG_SLUG = "hotel-ivoire-demo";

/**
 * Mot de passe des comptes de démonstration.
 *
 * Valeur publique et volontairement faible : ces comptes n'existent que dans
 * une base locale. Le seed refuse de s'exécuter en production (section 130), le
 * risque est donc nul — mais la valeur doit rester explicite pour que personne
 * ne la réutilise ailleurs.
 */
const SEED_PASSWORD = "DemoIvoire2026!";

/** Refuse de s'exécuter si l'environnement est marqué production. */
function assertNotProduction(): void {
  const isProduction = process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (isProduction && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refus d'exécuter le seed de démonstration en production. " +
        "Section 130 : aucune donnée de démo ne doit apparaître en production.",
    );
  }
}

/** Taxe communale de nuitée 2026 — configuration, jamais du code (§31). */
const NIGHT_TAX_2026: { classification: HotelClassification; amount: bigint }[] = [
  { classification: "NO_STAR", amount: 500n },
  { classification: "ONE_STAR", amount: 1000n },
  { classification: "TWO_STAR", amount: 1500n },
  { classification: "THREE_STAR_PLUS", amount: 2000n },
];

const SYSTEM_ROLES = [
  { code: "OWNER", name: "Propriétaire" },
  { code: "GENERAL_MANAGER", name: "Directeur général" },
  { code: "FRONT_DESK_MANAGER", name: "Responsable réception" },
  { code: "RECEPTIONIST", name: "Réceptionniste" },
  { code: "CASHIER", name: "Caissier" },
  { code: "HOUSEKEEPING_SUPERVISOR", name: "Gouvernante" },
  { code: "HOUSEKEEPER", name: "Agent de ménage" },
  { code: "MAINTENANCE", name: "Technicien" },
  { code: "ACCOUNTANT", name: "Comptable" },
  { code: "AUDITOR", name: "Auditeur" },
] as const;

/** Catalogue de permissions « resource.action » du §41. */
const PERMISSION_MATRIX = [
  ["reservation", "create"],
  ["reservation", "update"],
  ["reservation", "cancel"],
  ["reservation", "override_price"],
  ["reservation", "no_show"],
  ["stay", "check_in"],
  ["stay", "check_out"],
  ["stay", "change_room"],
  ["folio", "view"],
  ["folio", "post_charge"],
  ["folio", "adjust"],
  ["folio", "void"],
  ["payment", "create"],
  ["payment", "refund"],
  ["invoice", "create"],
  ["invoice", "finalize"],
  ["invoice", "cancel"],
  ["fne", "submit"],
  ["fne", "retry"],
  ["housekeeping", "assign"],
  ["housekeeping", "complete"],
  ["night_audit", "run"],
  ["night_audit", "close"],
  ["reports", "view"],
  ["settings", "manage"],
  ["users", "manage"],
] as const;


async function seed(): Promise<void> {
  assertNotProduction();

  // Nettoyage exhaustif de l'organisation de démonstration. Un run précédent
  // interrompu — ou un test de vérification — peut avoir laissé des lignes
  // partielles. La suppression se fait dans l'ordre des dépendances, sous
  // contexte RLS explicite, car plusieurs clés étrangères sont restrictives.
  const existing = await prisma.organization.findFirst({
    where: { slug: DEMO_ORG_SLUG },
    select: { id: true },
  });

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${existing.id}, true)`;
      await tx.$executeRaw`SELECT set_config('app.property_id', ${""}, true)`;

      // Tables rattachées à un utilisateur : les roles système n'ont pas de
      // rattachement propriété et échappent à la cascade par défaut.
      await tx.userRole.deleteMany({ where: { user: { organizationId: existing.id } } });
      await tx.account.deleteMany({ where: { user: { organizationId: existing.id } } });
      await tx.session.deleteMany({ where: { user: { organizationId: existing.id } } });
      await tx.auditLog.deleteMany({ where: { organizationId: existing.id } });
      await tx.outboxEvent.deleteMany({ where: { organizationId: existing.id } });
      await tx.idempotencyKey.deleteMany({ where: { organizationId: existing.id } });
      await tx.role.deleteMany({ where: { organizationId: existing.id } });
      await tx.user.deleteMany({ where: { organizationId: existing.id } });
      // Les propriétés tombent en cascade sur toutes les tables opérationnelles.
      await tx.property.deleteMany({ where: { organizationId: existing.id } });
      await tx.organization.delete({ where: { id: existing.id } });
    });

    console.log("Organisation de démonstration précédente supprimée.");
  }

  const organization = await prisma.organization.create({
    data: {
      name: "Hôtel Ivoire Demo",
      legalName: "Hôtel Ivoire Demo SARL",
      slug: DEMO_ORG_SLUG,
      defaultCurrency: "XOF",
      countryCode: "CI",
    },
  });

  // Le RLS est actif sur toutes les tables opérationnelles : toute écriture
  // doit se faire dans un contexte tenant explicite. C'est le comportement
  // voulu en production, le seed doit donc s'y conformer.
  const property = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${""}, true)`;

    return tx.property.create({
      data: {
        organizationId: organization.id,
        name: "Hôtel Ivoire Demo",
        code: "HID",
        slug: "hotel-ivoire-demo",
        legalName: "Hôtel Ivoire Demo SARL",
        taxIdentifier: "CI-DEMO-0001",
        city: "Abidjan",
        region: "District d'Abidjan",
        country: "CI",
        timezone: "Africa/Abidjan",
        currency: "XOF",
        hotelClassification: "THREE_STAR_PLUS",
        starRating: 3,
        status: "ACTIVE",
      },
    });
  });
  console.log(`Organisation et établissement créés : ${property.name} (${property.id})`);

  // Toutes les écritures suivantes sont regroupées dans un contexte tenant.
  // Le RLS refuse toute écriture sans contexte : le seed se conforme donc à
  // la règle de production au lieu de la contourner.
  await withTenant(organization.id, async (tx) => {
    await seedPhysicalStructure(tx, property.id);
    await seedPricing(tx, property.id);
    await seedTaxConfiguration(tx, property.id);
    await seedIdentity(tx, organization.id, property.id);
  });

  console.log("\nSeed de démonstration terminé.");
  console.log("Réservations, folios et paiements d'exemple sont créés par les tests d'intégration.");
}

/**
 * Exécute une opération dans un contexte RLS explicite.
 *
 * Le RLS est une barrière voulue : le seed ne doit pas la désactiver, il
 * doit écrire comme le fait l'application.
 */
async function withTenant<T>(
  organizationId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${""}, true)`;
    return operation(tx);
  });
}

/** Bâtiments, étages, types de chambres et chambres (section 9). */
async function seedPhysicalStructure(tx: Prisma.TransactionClient, propertyId: string): Promise<void> {
  const building = await tx.building.create({
    data: { propertyId, name: "Bâtiment principal", code: "MAIN" },
  });

  await tx.floor.createMany({
    data: [1, 2].map((number) => ({
      propertyId,
      buildingId: building.id,
      name: `Étage ${number}`,
      number,
    })),
  });

  const floors = await tx.floor.findMany({ where: { propertyId }, orderBy: { number: "asc" } });

  const roomTypes = await tx.roomType.createManyAndReturn({
    data: [
      {
        propertyId,
        name: "Chambre standard",
        code: "STD",
        description: "Chambre double classique",
        capacityAdults: 2,
        capacityChildren: 1,
        maxOccupancy: 3,
        baseOccupancy: 2,
        defaultRate: 45000n,
      },
      {
        propertyId,
        name: "Chambre supérieure",
        code: "SUP",
        description: "Chambre double avec vue dégagée",
        capacityAdults: 2,
        capacityChildren: 2,
        maxOccupancy: 4,
        baseOccupancy: 2,
        defaultRate: 65000n,
      },
      {
        propertyId,
        name: "Suite",
        code: "STE",
        description: "Suite avec salon séparé",
        capacityAdults: 3,
        capacityChildren: 2,
        maxOccupancy: 5,
        baseOccupancy: 3,
        defaultRate: 120000n,
      },
    ],
  });

  // 20 chambres (§77) : 10 par étage, numérotation continue.
  for (let index = 0; index < 20; index += 1) {
    const floor = floors[index % floors.length];
    const roomType = roomTypes[index % roomTypes.length];
    const position = Math.floor(index / floors.length) + 1;
    const number = `${floor.number}${String(position).padStart(2, "0")}`;

    await tx.room.create({
      data: {
        propertyId,
        buildingId: building.id,
        floorId: floor.id,
        roomTypeId: roomType.id,
        number,
        code: `R-${number}`,
        capacity: roomType.maxOccupancy,
      },
    });
  }

  console.log(`${roomTypes.length} types de chambres et 20 chambres créées`);
}

/** Plan de tarif, saison et politique d'annulation (sections 11 et 12). */
async function seedPricing(tx: Prisma.TransactionClient, propertyId: string): Promise<void> {
  const flexiblePolicy = await tx.cancellationPolicy.create({
    data: {
      propertyId,
      name: "Annulation flexible",
      description: "Gratuite jusqu'à 48h avant l'arrivée",
      deadlineHours: 48,
      penaltyType: "FIRST_NIGHT",
      noShowPenaltyType: "FIRST_NIGHT",
    },
  });

  const ratePlan = await tx.ratePlan.create({
    data: {
      propertyId,
      name: "Tarif public flexible",
      code: "BAR",
      description: "Tarif public, petit-déjeuner non inclus",
      mealPlan: "ROOM_ONLY",
      cancellationPolicyId: flexiblePolicy.id,
      isRefundable: true,
      isPublic: true,
    },
  });

  const season = await tx.season.create({
    data: {
      propertyId,
      name: "Haute saison",
      startDate: new Date("2026-12-01T00:00:00.000Z"),
      endDate: new Date("2027-02-28T00:00:00.000Z"),
      priority: 10,
    },
  });

  const roomTypes = await tx.roomType.findMany({ where: { propertyId } });

  await tx.ratePlanPrice.createMany({
    data: roomTypes.map((roomType) => ({
      propertyId,
      ratePlanId: ratePlan.id,
      roomTypeId: roomType.id,
      seasonId: season.id,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2026-12-31T00:00:00.000Z"),
      occupancy: roomType.baseOccupancy,
      amount: roomType.defaultRate ?? 0n,
      currency: "XOF",
    })),
  });

  console.log("Tarif public, saison et politique d'annulation créés");
}

/** Taxes, classification hôtelière et caisse (sections 30, 31 et 34). */
async function seedTaxConfiguration(tx: Prisma.TransactionClient, propertyId: string): Promise<void> {
  await tx.taxRule.create({
    data: {
      propertyId,
      name: "TVA 18%",
      code: "TVA-18",
      taxType: "VAT",
      jurisdiction: "NATIONAL",
      calculationMethod: "PERCENTAGE",
      rate: new Prisma.Decimal(18),
      isInclusive: false,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  await tx.nightTaxConfiguration.createMany({
    data: NIGHT_TAX_2026.map((entry) => ({
      propertyId,
      hotelClassification: entry.classification,
      amountPerNight: entry.amount,
      jurisdictionType: "MUNICIPAL",
      beneficiaryType: "COMMUNE",
      collectionPeriod: "MONTHLY",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    })),
  });

  await tx.cashRegister.create({
    data: { propertyId, name: "Caisse réception", code: "CAISSE-1", location: "Réception" },
  });

  console.log("Configuration fiscale (TVA + taxe de nuitée) et caisse créées");
}

/** Rôles, permissions, entreprises et clients (sections 40, 41 et 77). */
async function seedIdentity(
  tx: Prisma.TransactionClient,
  organizationId: string,
  propertyId: string,
): Promise<void> {
  await tx.role.createMany({
    data: SYSTEM_ROLES.map((role) => ({
      organizationId,
      name: role.name,
      code: role.code,
      isSystemRole: true,
    })),
  });

  // Le seed doit pouvoir être rejoué sans erreur : les permissions sont une
  // table de catalogue globale, sans portée tenant.
  await tx.permission.createMany({
    data: PERMISSION_MATRIX.map(([resource, action]) => ({ resource, action })),
    skipDuplicates: true,
  });

  await tx.company.createMany({
    data: Array.from({ length: 5 }, (_, index) => ({
      propertyId,
      name: `Entreprise Demo ${index + 1}`,
      legalName: `Entreprise Demo ${index + 1} SARL`,
      taxIdentifier: `CI-DEMO-C${index + 1}`,
      email: `contact${index + 1}@demo.ci`,
      paymentTerms: "NET_30",
      creditLimit: BigInt(5_000_000 + index * 1_000_000),
    })),
  });

  const firstNames = ["Aya", "Koffi", "Fatou", "Ibrahim", "Adjoua"];
  const lastNames = ["Kouassi", "Traoré", "Koné", "Bamba", "N'Guessan"];

  await tx.guest.createMany({
    data: Array.from({ length: 10 }, (_, index) => ({
      propertyId,
      guestCode: `GST-${String(index + 1).padStart(4, "0")}`,
      firstName: firstNames[index % firstNames.length],
      lastName: lastNames[index % lastNames.length],
      phone: `+2250700000${String(index).padStart(3, "0")}`,
      email: `client${index + 1}@demo.ci`,
      country: "CI",
      vipLevel: index < 2 ? "GOLD" : "NONE",
    })),
  });

  // Utilisateurs du personnel.
  //
  // Sans ces comptes, l'application n'a personne à qui se connecter : les rôles
  // et permissions seraient créés mais jamais portés par un utilisateur. Le
  // propriétaire couvre toute l'organisation, les autres rôles sont limités à
  // l'établissement de démonstration, conformément à la portée de `user_roles`.
  //
  // Les mots de passe sont hashés avec le même algorithme que l'authentification
  // (Argon2id). Ils ne valent que pour la démonstration et sont documentés comme
  // tels : aucun secret réel ne figure dans le dépôt.
  const staffPassword = await hashPassword(SEED_PASSWORD);

  const staff = [
    { email: "owner@demo.ci", firstName: "Aya", lastName: "Kouassi", roleCode: "OWNER" },
    {
      email: "manager@demo.ci",
      firstName: "Koffi",
      lastName: "Traoré",
      roleCode: "GENERAL_MANAGER",
    },
    {
      email: "reception@demo.ci",
      firstName: "Fatou",
      lastName: "Koné",
      roleCode: "FRONT_DESK_MANAGER",
    },
    {
      email: "receptionist@demo.ci",
      firstName: "Ibrahim",
      lastName: "Bamba",
      roleCode: "RECEPTIONIST",
    },
    { email: "cashier@demo.ci", firstName: "Adjoua", lastName: "N'Guessan", roleCode: "CASHIER" },
  ];

  const roles = await tx.role.findMany({
    where: { organizationId },
    select: { id: true, code: true },
  });

  // La clé du dictionnaire est typée explicitement : sans cela, `Map` infère
  // `RoleCode | null` et l'indexation par chaîne du personnel est refusée.
  const roleByCode = new Map<string, string>(
    roles.flatMap((role) => (role.code ? [[role.code as string, role.id] as const] : [])),
  );

  for (const member of staff) {
    const roleId = roleByCode.get(member.roleCode);

    if (!roleId) {
      throw new Error(`Rôle ${member.roleCode} introuvable pour le seed.`);
    }

    const user = await tx.user.create({
      data: {
        organizationId,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: `+2250700000${String(staff.indexOf(member)).padStart(3, "0")}`,
        passwordHash: staffPassword,
        // `INVITED` refuserait la connexion : un compte de démonstration doit
        // être actif, sinon personne ne peut tester l'application.
        status: "ACTIVE",
      },
      select: { id: true },
    });

    await tx.userRole.create({
      data: {
        userId: user.id,
        roleId,
        // Le propriétaire couvre l'organisation, les autres sont rattachés à
        // l'établissement : c'est ce qui donne à la réception son périmètre.
        propertyId: member.roleCode === "OWNER" ? null : propertyId,
      },
    });
  }

  console.log(
    `${SYSTEM_ROLES.length} rôles, ${PERMISSION_MATRIX.length} permissions, ` +
      "5 entreprises, 10 clients et " +
      `${staff.length} utilisateurs de démonstration créés`,
  );
}

seed()
  .catch((error) => {
    console.error("Échec du seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
