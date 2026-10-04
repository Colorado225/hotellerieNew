import { Suspense } from "react";

import { Globe } from "lucide-react";
import type { Metadata } from "next";

import { APP_CONFIG } from "@/config/app-config";

import { AuthShowcase } from "../../_components/auth-showcase";
import { LoginForm } from "../../_components/login-form";
import { GoogleButton } from "../../_components/social-auth/google-button";

/**
 * La connexion Google n'est offerte que si le fournisseur est réellement
 * configuré. Afficher un bouton qui échouerait sur une erreur de configuration
 * nuirait à l'utilisateur ; mieux vaut le masquer.
 */
const isGoogleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/**
 * La disponibilité du bouton dépend de la configuration au moment de la
 * requête. Sans cela, la page étant pré-rendue, la valeur serait figée au
 * build : un déploiement sans identifiants afficherait un écran sans bouton
 * même après ajout des clés.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion | LagoonKey",
  description: "Accédez au système de gestion hôtelière LagoonKey de votre établissement.",
  alternates: {
    canonical: "/auth/v2/login",
  },
};

export default function LoginV2() {
  return (
    <>
      <AuthShowcase
        quote="Réservations, séjours et folios réunis dans un seul outil, pour chaque équipe de votre hôtel."
      />

      <div className="relative order-1 flex h-full">
        <div className="flex w-full flex-col justify-center gap-8 px-6 sm:w-[400px]">
          <header className="space-y-2 text-center">
            <h1 className="font-medium text-3xl">Bon retour</h1>
            <p className="text-muted-foreground text-sm">
              Connectez-vous avec l&apos;adresse associée à votre établissement.
            </p>
          </header>

          <div className="space-y-4">
            {isGoogleEnabled && (
              <>
                <GoogleButton className="w-full" />
                <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-border after:border-t">
                  <span className="relative z-10 bg-background px-2 text-muted-foreground">
                    ou avec votre adresse email
                  </span>
                </div>
              </>
            )}

            {/* `useSearchParams` forces a client-side boundary. */}
            <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
              <LoginForm />
            </Suspense>
          </div>

          {/* No self-service registration: a PMS account is granted by an
              establishment, not opened by the user. The link previously offered
              here led to a screen with no working backend. */}

          <div className="flex w-full justify-between text-sm">
            <div className="text-muted-foreground">{APP_CONFIG.copyright}</div>
            <div className="flex items-center gap-1">
              <Globe className="size-4 text-muted-foreground" />
              FR
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
