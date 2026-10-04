"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center space-y-2 px-6 text-center">
      <h1 className="font-semibold text-2xl">Page introuvable.</h1>
      <p className="text-muted-foreground">
        L&apos;adresse demandée n&apos;existe pas ou n&apos;est plus accessible.
      </p>
      {/* La cible est l'écran d'accueil réel du PMS. La route
          `/dashboard/default` du template n'a jamais existé : le lien
          conduisait à une seconde page 404. */}
      <Link prefetch={false} replace href="/dashboard/front-desk">
        <Button variant="outline">Retour à la réception</Button>
      </Link>
    </div>
  );
}
