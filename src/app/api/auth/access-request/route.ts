import { NextResponse } from "next/server";
import { z } from "zod";

import { submitAccessRequest } from "@/modules/auth/access-requests";

/**
 * Réception des demandes d'accès du formulaire public.
 *
 * Route volontairement sans session : c'est la seule écriture accessible hors
 * authentification, et elle ne touche que `access_requests`. Aucun compte, aucun
 * rôle et aucun établissement n'y sont créés — la demande reste en attente
 * d'instruction.
 */

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  password: z.string().min(12).max(200),
  type: z.enum(["OWNER", "MANAGER", "AGENT"]),
});

/**
 * Limitation de débit.
 *
 * Un formulaire public sans plafond permet de remplir la table de demandes. Le
 * compteur est en mémoire et par adresse : il protège d'un usage abusif sans
 * nécessiter Redis, qui n'est pas encore branché. La fenêtre est courte et le
 * seuil volontairement bas — une personne saisit rarement plus de trois
 * demandes consécutives.
 */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(identifier);

  if (!entry || entry.resetAt < now) {
    rateLimit.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export async function POST(request: Request) {
  // L'adresse est lue depuis les en-têtes de transfert : en production, le
  // reverse proxy les renseigne. Leur absence ne bloque pas la demande, faute
  // de quoi le formulaire deviendrait inutilisable derrière un proxy non
  // configuré.
  const forwarded = request.headers.get("x-forwarded-for");
  const identifier = forwarded?.split(",")[0]?.trim() ?? "inconnu";

  if (isRateLimited(identifier)) {
    return NextResponse.json(
      { message: "Trop de demandes envoyées. Réessayez dans quelques minutes." },
      { status: 429 },
    );
  }

  // Un corps illisible ou surdimensionné est refusé avant toute analyse : le
  // service n'a pas à traiter une charge arbitraire.
  const raw = await request.text();

  if (raw.length > 8_000) {
    return NextResponse.json({ message: "Requête trop volumineuse." }, { status: 413 });
  }

  let body: unknown;

  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Requête invalide." }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Données invalides." }, { status: 400 });
  }

  const result = await submitAccessRequest(parsed.data);

  // Un compte actif reçoit un message explicite : son propriétaire connaît déjà
  // l'existence de ce compte, l'authentification lui a déjà appris.
  if (!result.ok && result.reason === "already_active") {
    return NextResponse.json(
      { message: "Un compte existe déjà pour cette adresse. Connectez-vous." },
      { status: 409 },
    );
  }

  // « Demande en attente » et « adresse inconnue » renvoient la même réponse :
  // cela ne permet pas de découvrir quelles adresses sont déjà connues.
  if (!result.ok) {
    return NextResponse.json(
      { message: "Votre demande a été enregistrée. Elle sera instruite par l'établissement." },
      { status: 202 },
    );
  }

  return NextResponse.json(
    { message: "Votre demande a été enregistrée. Elle sera instruite par l'établissement." },
    { status: 201 },
  );
}