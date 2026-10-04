"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  email: z.email({ message: "Saisissez une adresse email valide." }),
  password: z.string().min(1, { message: "Le mot de passe est requis." }),
  remember: z.boolean().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Formulaire de connexion.
 *
 * Unlike the original template version, which only displayed the values in a
 * toast, this one calls Auth.js for real. `redirect: false` keeps Auth.js on
 * the page so the error can be shown in place: a redirect to the error page
 * would lose the context and give the user a dead end.
 *
 * The error message is deliberately identical whatever the cause. The
 * credentials provider refuses both an unknown account and a bad password
 * alike (section 69); distinguishing them here would reintroduce the account
 * enumeration the backend went to such lengths to prevent.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "", remember: false },
  });

  // Only internal destinations are honoured, for the same reason as the Google
  // button: this parameter comes from the query string.
  const rawCallback = searchParams.get("callbackUrl");
  const callbackUrl =
    rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : "/dashboard/front-desk";

  async function onSubmit(values: FormValues) {
    setPending(true);

    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        toast.error("Connexion impossible", {
          description: "Adresse email ou mot de passe incorrect.",
        });
        return;
      }

      // Full navigation rather than a client-side transition: the session is
      // read from the database, and the dashboard resolves the tenant from it.
      window.location.href = result?.url ?? callbackUrl;
    } catch {
      toast.error("Connexion impossible", {
        description: "Le service d'authentification est injoignable. Réessayez dans un instant.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-email">Adresse email</FieldLabel>
              <Input
                {...field}
                id="login-email"
                type="email"
                placeholder="vous@hotel.ci"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="login-password">Mot de passe</FieldLabel>
                {/* Password recovery is not part of the MVP: no route, no
                    service behind it. The link would be a dead end. */}
              </div>
              <Input
                {...field}
                id="login-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="remember"
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <Checkbox
                id="login-remember"
                name={field.name}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                aria-invalid={fieldState.invalid}
              />
              <FieldContent>
                <FieldLabel htmlFor="login-remember" className="font-normal">
                  Rester connecté
                </FieldLabel>
              </FieldContent>
            </Field>
          )}
        />
      </FieldGroup>
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
