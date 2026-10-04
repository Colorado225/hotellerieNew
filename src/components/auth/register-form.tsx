"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Mail, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { AuthCard } from "./auth-card";
import { AuthDivider } from "./auth-divider";
import { containerVariants, itemVariants, softTransition } from "./motion";
import { PasswordInput } from "./password-input";
import { AuthFieldLabel, PasswordStrength } from "./password-strength";
import { SocialAuth } from "./social-auth";

const schema = z
  .object({
    firstName: z.string().trim().min(1, { message: "Le prénom est requis." }).max(80),
    lastName: z.string().trim().min(1, { message: "Le nom est requis." }).max(80),
    email: z.email({ message: "Saisissez une adresse email valide." }),
    password: z
      .string()
      .min(12, { message: "Le mot de passe doit contenir au moins 12 caractères." }),
    confirmPassword: z.string().min(1, { message: "Confirmez votre mot de passe." }),
    accountType: z.enum(["OWNER", "MANAGER", "AGENT"]),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

type Values = z.infer<typeof schema>;

const ACCOUNT_TYPES = [
  { value: "OWNER", label: "Propriétaire", hint: "Gère un ou plusieurs établissements" },
  { value: "MANAGER", label: "Directeur", hint: "Pilote l'exploitation d'un hôtel" },
  { value: "AGENT", label: "Agent", hint: "Accède aux missions qui lui sont confiées" },
] as const;

const STEPS = [
  { id: 0, label: "Identité" },
  { id: 1, label: "Profil" },
  { id: 2, label: "Sécurité" },
] as const;

/**
 * Formulaire de demande d'accès (pages.md sections 12, 13, 28 et 29).
 *
 * Onboarding en trois étapes (section 13), progression animée par Framer Motion.
 * Chaque étape ne valide que ses propres champs : exiger la confirmation du mot
 * de passe avant d'avoir choisi un profil produirait des erreurs prématurées.
 *
 * Important — ce formulaire ne crée pas de compte.
 *
 * Dans un PMS multi-tenant, un accès n'est jamais auto-attribué : il faut une
 * organisation et un rôle, or aucun des deux ne peut être déduit d'un formulaire
 * public. La soumission est donc désactivée tant qu'aucun service d'invitation
 * n'existe. Le §142 du cahier des charges interdit d'annoncer une
 * fonctionnalité non terminée, d'où le libellé explicite plutôt qu'un bouton
 * actif qui échouerait à l'envoi.
 */
export function RegisterForm() {
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  // États de soumission : `pending` pendant l'appel, `sent` une fois la demande
  // enregistrée. `error` porte un message déjà prêt à afficher.
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      accountType: "MANAGER",
    },
  });

  const { trigger, formState, getValues, reset } = form;

  /**
   * Dépose la demande d'accès.
   *
   * Le mot de passe est transmis au format clair sur cette seule requête, en
   * HTTPS, puis haché côté serveur. Il ne doit surtout pas être journalisé :
   * la réponse du service est volontairement ignorée au-delà du message.
   */
  async function onSubmit() {
    setPending(true);
    setError(null);

    const values = getValues();

    try {
      const response = await fetch("/api/auth/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
          type: values.accountType,
        }),
      });

      const payload = (await response.json()) as { message?: string };

      if (response.status === 409) {
        // Compte existant : l'information ne peut pas être divulguée, mais
        // l'utilisateur sait qu'il possède déjà un accès.
        setError(payload.message ?? "Un compte existe déjà pour cette adresse.");
        setPending(false);
        return;
      }

      if (!response.ok) {
        setError(payload.message ?? "La demande n'a pas pu être enregistrée.");
        setPending(false);
        return;
      }

      // Confirmation : le formulaire laisse place à un état de succès. Les
      // valeurs sont effacées pour ne pas laisser le mot de passe en mémoire
      // plus longtemps que nécessaire.
      reset();
      setSent(true);
    } catch {
      setError("Le service est injoignable. Réessayez dans un instant.");
      setPending(false);
    }
  }

  /** Les champs contrôlés par l'étape courante. */
  const stepFields = [
    ["firstName", "lastName", "email"],
    ["accountType"],
    ["password", "confirmPassword"],
  ] as const;

  async function next() {
    const valid = await trigger(stepFields[step], { shouldFocus: true });

    if (valid && step < STEPS.length - 1) {
      setStep((current) => current + 1);
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
            Demander un accès
          </h2>
          <p className="text-[13.5px] text-white/55">
            Votre établissement valide chaque demande avant attribution.
          </p>
        </motion.header>

        {/* Progression (section 13). Le rail se remplit par animation de
            `scaleX` et non de `width`, afin de rester sur le GPU (section 21). */}
        <motion.div
          className="space-y-3"
          variants={reducedMotion ? undefined : itemVariants}
          aria-hidden="true"
        >
          <div className="flex items-center justify-between">
            {STEPS.map((item, index) => (
              <span
                key={item.id}
                className="text-[10.5px] font-medium tracking-[0.12em] uppercase transition-colors duration-300"
                style={{ color: index <= step ? "rgba(245,184,91,0.9)" : "rgba(255,255,255,0.3)" }}
              >
                {String(item.id + 1).padStart(2, "0")}
              </span>
            ))}
          </div>

          <div className="h-px w-full bg-white/10">
            <motion.div
              className="h-px origin-left bg-[#F5B85B]"
              initial={false}
              animate={{ scaleX: (step + 1) / STEPS.length }}
              transition={reducedMotion ? { duration: 0 } : softTransition}
            />
          </div>

          <p className="text-[11.5px] text-white/45">
            Étape {step + 1} sur {STEPS.length} — {STEPS[step].label}
          </p>
        </motion.div>

        {/* Confirmation (section 28, état `success`). Le formulaire disparaît au profit
            d'un récapitulatif : la demande est enregistrée, mais aucun compte
            n'existe tant qu'un établissement ne l'a pas approuvée. */}
        {sent ? (
          <motion.div
            className="space-y-5 text-center"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reducedMotion ? undefined : softTransition}
            role="status"
          >
            <span className="mx-auto grid size-12 place-items-center rounded-full border border-[#F5B85B]/30 bg-[#F5B85B]/10">
              <Check className="size-5 text-[#F5B85B]" aria-hidden="true" />
            </span>
            <div className="space-y-2">
              <h3 className="text-[17px] font-semibold text-white">Demande enregistrée</h3>
              <p className="text-[13px] leading-relaxed text-white/55">
                L&apos;établissement sera notifié. Vous pourrez vous connecter une fois
                votre accès validé.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-block text-[13px] font-medium text-[#F5B85B] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[#F5B85B]/50 focus-visible:outline-none"
            >
              Retour à la connexion
            </Link>
          </motion.div>
        ) : (
          <motion.form
            noValidate
            className="space-y-5"
            variants={reducedMotion ? undefined : itemVariants}
            onSubmit={form.handleSubmit(onSubmit)}
          >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              className="space-y-5"
              initial={reducedMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: -16 }}
              transition={reducedMotion ? undefined : softTransition}
            >
              {step === 0 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <AuthFieldLabel htmlFor="register-first-name">Prénom</AuthFieldLabel>
                      <div className="relative">
                        <User
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/30"
                        />
                        <Controller
                          control={form.control}
                          name="firstName"
                          render={({ field, fieldState }) => (
                            <Input
                              {...field}
                              id="register-first-name"
                              data-auth-input
                              autoComplete="given-name"
                              placeholder="Aya"
                              aria-invalid={fieldState.invalid}
                              className="pl-10"
                            />
                          )}
                        />
                      </div>
                      {formState.errors.firstName && (
                        <FieldError message={formState.errors.firstName.message} />
                      )}
                    </div>

                    <div className="space-y-2">
                      <AuthFieldLabel htmlFor="register-last-name">Nom</AuthFieldLabel>
                      <div className="relative">
                        <User
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/30"
                        />
                        <Controller
                          control={form.control}
                          name="lastName"
                          render={({ field, fieldState }) => (
                            <Input
                              {...field}
                              id="register-last-name"
                              data-auth-input
                              autoComplete="family-name"
                              placeholder="Kouassi"
                              aria-invalid={fieldState.invalid}
                              className="pl-10"
                            />
                          )}
                        />
                      </div>
                      {formState.errors.lastName && (
                        <FieldError message={formState.errors.lastName.message} />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <AuthFieldLabel htmlFor="register-email">
                      Adresse email professionnelle
                    </AuthFieldLabel>
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
                            id="register-email"
                            type="email"
                            data-auth-input
                            autoComplete="email"
                            placeholder="vous@hotel.ci"
                            aria-invalid={fieldState.invalid}
                            className="pl-10"
                          />
                        )}
                      />
                    </div>
                    {formState.errors.email && (
                      <FieldError message={formState.errors.email.message} />
                    )}
                  </div>
                </>
              )}

              {step === 1 && (
                <Controller
                  control={form.control}
                  name="accountType"
                  render={({ field }) => (
                    <fieldset className="space-y-3">
                      <legend className="mb-3 text-[13px] font-medium text-white/70">
                        Votre fonction
                      </legend>

                      {ACCOUNT_TYPES.map((type) => {
                        const selected = field.value === type.value;

                        return (
                          <label
                            key={type.value}
                            className="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-all duration-250"
                            style={{
                              borderColor: selected
                                ? "rgba(245,184,91,0.5)"
                                : "rgba(255,255,255,0.08)",
                              background: selected
                                ? "rgba(245,184,91,0.07)"
                                : "rgba(255,255,255,0.025)",
                            }}
                          >
                            <input
                              type="radio"
                              name={field.name}
                              value={type.value}
                              checked={selected}
                              onChange={field.onChange}
                              className="sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors"
                              style={{
                                borderColor: selected ? "#F5B85B" : "rgba(255,255,255,0.22)",
                              }}
                            >
                              {selected && <span className="size-2 rounded-full bg-[#F5B85B]" />}
                            </span>
                            <span>
                              <span className="block text-[13.5px] font-medium text-white">
                                {type.label}
                              </span>
                              <span className="mt-0.5 block text-[12px] text-white/45">
                                {type.hint}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                />
              )}

              {step === 2 && (
                <>
                  <Controller
                    control={form.control}
                    name="password"
                    render={({ field, fieldState }) => (
                      <div className="space-y-2.5">
                        <PasswordInput
                          ref={field.ref}
                          id="register-password"
                          autoComplete="new-password"
                          placeholder="12 caractères minimum"
                          value={field.value}
                          onChange={field.onChange}
                          invalid={fieldState.invalid}
                        />
                        <PasswordStrength value={field.value} />
                        {formState.errors.password && (
                          <FieldError message={formState.errors.password.message} />
                        )}
                      </div>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="confirmPassword"
                    render={({ field, fieldState }) => (
                      <div className="space-y-2">
                        <PasswordInput
                          ref={field.ref}
                          id="register-confirm-password"
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={field.value}
                          onChange={field.onChange}
                          invalid={fieldState.invalid}
                        />
                        {formState.errors.confirmPassword && (
                          <FieldError message={formState.errors.confirmPassword.message} />
                        )}
                      </div>
                    )}
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation entre les étapes. */}
          <div className="flex gap-3 pt-1">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((current) => current - 1)}
                className="h-[50px] flex-1 cursor-pointer border-white/12 bg-white/[0.03] text-white/80 hover:bg-white/[0.07] hover:text-white"
              >
                Retour
              </Button>
            )}

            {step < STEPS.length - 1 ? (
              <Button type="button" data-auth-cta onClick={next} className="flex-1 cursor-pointer">
                Continuer
              </Button>
            ) : (
              <Button
                type="submit"
                data-auth-cta
                disabled={pending}
                className="flex-1 cursor-pointer"
              >
                {pending ? (
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="size-4 animate-spin rounded-full border-2 border-[#1a1206]/30 border-t-[#1a1206]"
                    />
                    Envoi…
                  </span>
                ) : (
                  "Envoyer la demande"
                )}
              </Button>
            )}
          </div>

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

          <p className="rounded-xl border border-[#F5B85B]/20 bg-[#F5B85B]/[0.06] px-3.5 py-3 text-[12px] leading-relaxed text-white/60">
            L&apos;ouverture des comptes est pilotée par les établissements. Cette demande sert à
            instruire votre accès, elle ne crée pas encore de compte.
          </p>
        </motion.form>
        )}

        <motion.div className="space-y-5" variants={reducedMotion ? undefined : itemVariants}>
          <AuthDivider label="OU" />
          <SocialAuth />

          <p className="text-center text-[13px] text-white/50">
            Vous avez déjà un accès ?{" "}
            <Link
              href="/login"
              className="font-medium text-[#F5B85B] underline-offset-4 transition-colors hover:text-[#f7c377] hover:underline focus-visible:ring-2 focus-visible:ring-[#F5B85B]/50 focus-visible:outline-none"
            >
              Se connecter
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </AuthCard>
  );
}

/** Message d'erreur sous un champ (section 28). */
function FieldError({ message }: { message?: string }) {
  return (
    <motion.p
      role="alert"
      className="text-[12px] text-[#f87171]"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
    >
      {message}
    </motion.p>
  );
}
