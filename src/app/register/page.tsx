import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "@/components/auth/register-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demander un accès | LagoonKey",
  description: "Demandez l'accès à votre établissement sur LagoonKey.",
  alternates: { canonical: "/register" },
};

export default function RegisterPage() {
  return (
    <AuthLayout
      routeKey="register"
      badge="Property Management"
      headline={["Pilotez votre", "établissement.", " sereinement."]}
    >
      <RegisterForm />
    </AuthLayout>
  );
}