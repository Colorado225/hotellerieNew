import Link from "next/link";

import type { Metadata } from "next";

import { APP_CONFIG } from "@/config/app-config";

import { AuthShowcase } from "../../_components/auth-showcase";
import { RegisterForm } from "../../_components/register-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activer mon accès | LagoonKey",
  description: "Activez l'accès à LagoonKey attribué par votre établissement.",
  alternates: {
    canonical: "/auth/v2/register",
  },
};

/**
 * Écran d'activation d'un accès invité.
 *
 * Ce n'est pas une inscription : le compte a déjà été créé par l'établissement
 * qui l'a invité. Aucun lien n'est proposé depuis la page de connexion, pour
 * que l'écran ne soit atteint que depuis le lien d'invitation.
 *
 * La page occupe toute la largeur : elle a son propre fond pleine page et ne
 * doit pas être cantonnée à la moitié de la grille du layout.
 */
export default function RegisterV2() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4 lg:col-span-2">
      {/* Fond pleine page, conformément à la maquette. */}
      <AuthShowcase
        variant="full"
        quote="Votre établissement vous a attribué un accès. Définissez votre mot de passe pour commencer."
      />

      <div className="relative z-10 w-full max-w-sm space-y-6">
        <header className="flex items-center justify-center">
          <span className="text-lg font-medium text-primary-foreground">LagoonKey</span>
        </header>

        <div className="space-y-6 rounded-2xl bg-card p-6 shadow-lg">
          <div className="space-y-1.5 text-center">
            <h1 className="font-medium text-xl">Activer mon accès</h1>
            <p className="text-muted-foreground text-sm">
              Renseignez votre identité et choisissez votre mot de passe.
            </p>
          </div>

          <RegisterForm />
        </div>

        <p className="text-center text-sm text-primary-foreground/80">
          Vous avez déjà un accès ?{" "}
          <Link prefetch={false} className="underline" href="/auth/v2/login">
            Se connecter
          </Link>
        </p>

        <p className="text-center text-xs text-primary-foreground/60">{APP_CONFIG.copyright}</p>
      </div>
    </div>
  );
}
