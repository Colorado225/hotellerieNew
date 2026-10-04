import { cn } from "cn";
import { siGoogle } from "simple-icons";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";

/**
 * Bouton de connexion par compte Google.
 *
 * Le bouton est soumis via un formulaire POST vers la route Auth.js, qui gère
 * la redirection OAuth et la protection CSRF. Un `button` isolé ne soumettrait
 * rien : le formulaire explicite est nécessaire.
 *
 * La destination est restreinte à une route interne, ce qui évite d'utiliser la
 * page comme point de rebond vers un site tiers.
 */
export function GoogleButton({
  className,
  callbackUrl = "/dashboard/front-desk",
  children,
  ...props
}: React.ComponentProps<typeof Button> & { callbackUrl?: string }) {
  // Un `callbackUrl` externe ne doit jamais être suivi : Auth.js le renvoie
  // tel quel après authentification. `//evil.example` est un chemin absolu
  // pour le navigateur et passe une simple vérification de préfixe.
  const isInternal = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//");
  const target = isInternal ? callbackUrl : "/dashboard/front-desk";

  return (
    <form action="/api/auth/signin/google" method="post" className="w-full">
      <input type="hidden" name="callbackUrl" value={target} />
      <Button variant="secondary" className={cn("w-full", className)} type="submit" {...props}>
        <SimpleIcon icon={siGoogle} className="size-4" />
        {children ?? "Continue with Google"}
      </Button>
    </form>
  );
}
