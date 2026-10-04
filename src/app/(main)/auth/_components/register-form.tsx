"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const formSchema = z
  .object({
    firstName: z.string().trim().min(1, { message: "Le prénom est requis." }).max(80),
    lastName: z.string().trim().min(1, { message: "Le nom est requis." }).max(80),
    password: z
      .string()
      .min(12, { message: "Le mot de passe doit contenir au moins 12 caractères." }),
    confirmPassword: z.string().min(1, { message: "Confirmez votre mot de passe." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

/**
 * Formulaire d'activation d'un accès invité.
 *
 * Il ne s'agit pas d'une inscription libre. Le compte existe déjà en base avec
 * le statut `INVITED`, créé par un établissement qui lui a attribué un rôle et
 * un périmètre. Ce formulaire ne fait qu'activer ce compte et définir son mot de
 * passe — l'utilisateur ne choisit ni son établissement ni ses droits.
 *
 * Le formulaire reste volontairement non soumis tant qu'aucun service
 * d'activation n'existe : une soumission créerait soit un compte hors des
 * règles de tenancy, soit ne ferait rien du tout. Le bouton est désactivé et
 * l'écran explique pourquoi, plutôt que d'accepter une saisie qui échouerait
 * à l'envoi.
 */
export function RegisterForm({ invitationToken }: { invitationToken?: string }) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { firstName: "", lastName: "", password: "", confirmPassword: "" },
  });

  return (
    <form noValidate className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="firstName"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="register-first-name">Prénom</FieldLabel>
                <Input
                  {...field}
                  id="register-first-name"
                  autoComplete="given-name"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="lastName"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="register-last-name">Nom</FieldLabel>
                <Input
                  {...field}
                  id="register-last-name"
                  autoComplete="family-name"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="register-password">Mot de passe</FieldLabel>
              <Input
                {...field}
                id="register-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                Au moins 12 caractères. Ce mot de passe protège les données de vos clients.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="register-confirm-password">Confirmer le mot de passe</FieldLabel>
              <Input
                {...field}
                id="register-confirm-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <Button className="w-full" type="submit" disabled>
        Activer mon accès
      </Button>

      {!invitationToken && (
        <p className="text-muted-foreground text-center text-xs">
          Cette page s&apos;utilise depuis le lien d&apos;invitation reçu de votre établissement.
        </p>
      )}
    </form>
  );
}
