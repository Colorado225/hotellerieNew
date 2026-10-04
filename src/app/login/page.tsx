import { Suspense } from "react";

import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";

/**
 * La disponibilité des fournisseurs sociaux est décidée à l'exécution : la page
 * est rendue dynamiquement pour ne pas figer au build un écran sans bouton.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion | LagoonKey",
  description: "Accédez à votre espace de gestion hôtelière LagoonKey.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <AuthLayout
      // La clé change avec la route, ce qui déclenche la transition (section 17).
      routeKey="login"
      badge="Property Management"
      headline={["Gérez vos biens.", "Réinventez votre", "expérience."]}
    >
      {/* `useSearchParams` impose une frontière cliente dans le formulaire. */}
      <Suspense fallback={<div className="h-[32rem] w-full max-w-[27rem]" aria-hidden="true" />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}