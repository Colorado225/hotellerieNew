"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

import { AuthCard } from "./auth-card";
import { AuthDivider } from "./auth-divider";
import { containerVariants, itemVariants } from "./motion";
import { PasswordInput } from "./password-input";
import { AuthFieldLabel } from "./password-strength";
import { SocialAuth } from "./social-auth";

const schema = z.object({
  email: z.email({ message: "Saisissez une adresse email valide." }),
  password: z.string().min(1, { message: "Le mot de passe est requis." }),
  remember: z.boolean().optional(),
});

type Values = z.infer<typeof schema>;

/**
 * Formulaire de connexion (pages.md sections 11, 28 et 31).
 *
 * Branché à Auth.js : `redirect: false` maintient l'appel sur la page pour que
 * l'erreur puisse être affichée en place. Un message unique est volontairement
 * utilisé — distinguer « compte inconnu » de « mot de passe faux » permettrait
 * d'énumérer les comptes existants, ce que le provider Credentials refuse
 * volontairement côté serveur.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: false },
  });

  // Seules les destinations internes sont suivies : ce paramètre provient de la
  // chaîne de requête, et `//example.com` est un chemin absolu pour le
  // navigateur.
  const rawCallback = searchParams.get("callbackUrl");
  const callbackUrl =
    rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : "/dashboard/front-desk";

  async function onSubmit(values: Values) {
    setPending(true);
    setError(null);

    try {
      const { signIn } = await import("next-auth/react");
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError("Adresse email ou mot de passe incorrect.");
        setPending(false);
        return;
      }

      // Navigation complète plutôt que transition client : la session est lue en
      // base et le dashboard résout le tenant à partir d'elle.
      router.push(result?.url ?? callbackUrl);
      router.refresh();
    } catch {
      setError("Le service d'authentification est injoignable. Réessayez dans un instant.");
      setPending(false);
    }
  }
return (
    <AuthCard>
      <motion.div
        className="space-y-7"
        variants={reducedMotion ? undefined : containerVariants}
        initial={reducedMotion ? false : "hidden"}
        animate={reducedMotion ? undefined : "visible"}
      >
        <motion.header className="space-y-2" variants={reducedMotion ? undefined : itemVariants}>
          <h2 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-white">
            Bon retour
          </h2>
          <p className="text-[13.5px] text-white/55">
            Connectez-vous pour accéder à votre espace de gestion.
          </p>
        </motion.header>

        <motion.form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
          variants={reducedMotion ? undefined : itemVariants}
        >
          <div className="space-y-2">
            <AuthFieldLabel htmlFor="login-email">Adresse email</AuthFieldLabel>

            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/30"
              />
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Input
                    {...field}
                    id="login-email"
                    type="email"
                    placeholder="vous@hotel.ci"
                    autoComplete="email"
                    data-auth-input
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? "login-email-error" : undefined}
                    className="pl-10"
                  />
                )}
              />
            </div>

            {form.formState.errors.email && (
              <motion.p
                id="login-email-error"
                role="alert"
                className="text-[12px] text-[#f87171]"
                initial={reducedMotion ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
              >
                {form.formState.errors.email.message}
              </motion.p>
            )}
          </div>

          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <div className="space-y-2">
                <PasswordInput
                  ref={field.ref}
                  id="login-password"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={fieldState.invalid}
                />
                {form.formState.errors.password && (
                  <motion.p
                    id="login-password-error"
                    role="alert"
                    className="text-[12px] text-[#f87171]"
                    initial={reducedMotion ? false : { opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    {form.formState.errors.password.message}
                  </motion.p>
                )}
              </div>
            )}
          />

          <label className="flex cursor-pointer items-center gap-2.5 pt-1">
            <Controller
              control={form.control}
              name="remember"
              render={({ field }) => (
                <Checkbox
                  id="login-remember"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                  className="border-white/20 bg-white/[0.04] data-[state=checked]:border-[#F5B85B] data-[state=checked]:bg-[#F5B85B]"
                />
              )}
            />
            <AuthFieldLabel htmlFor="login-remember" className="cursor-pointer">
              Se souvenir de moi
            </AuthFieldLabel>
          </label>

          {error && (
            <motion.p
              role="alert"
              className="rounded-xl border border-[#f87171]/25 bg-[#f87171]/10 px-3.5 py-2.5 text-[12.5px] text-[#fca5a5]"
              initial={reducedMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.p>
          )}

          <Button type="submit" data-auth-cta disabled={pending} className="w-full cursor-pointer">
            {pending ? (
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-[#1a1206]/30 border-t-[#1a1206]"
                />
                Connexion…
              </span>
            ) : (
              "Se connecter"
            )}
          </Button>
        </motion.form>

        <motion.div className="space-y-5" variants={reducedMotion ? undefined : itemVariants}>
          <AuthDivider label="OU" />
          <SocialAuth />

          <p className="text-center text-[13px] text-white/50">
            Vous n&apos;avez pas de compte ?{" "}
            <Link
              href="/register"
              className="font-medium text-[#F5B85B] underline-offset-4 transition-colors hover:text-[#f7c377] hover:underline focus-visible:ring-2 focus-visible:ring-[#F5B85B]/50 focus-visible:outline-none"
            >
              Demander un accès
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </AuthCard>
  );
}