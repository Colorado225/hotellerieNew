import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (ex-`middleware`, renommé dans Next.js 16).
 *
 * Deux responsabilités, volontairement limitées :
 *
 * 1. Poser les en-têtes de sécurité sur toutes les réponses.
 * 2. Rediriger vers la page de connexion les requêtes vers le PMS qui
 *    n'ont pas de session.
 *
 * Le contrôle d'accès fin ne se fait PAS ici : le proxy s'exécute hors du
 * runtime applicatif, sur le CDN, et ne peut pas interroger la base. Une
 * autorisation y serait à la fois coûteuse et non fiable. La vérification
 * réelle des permissions et du tenant est faite dans les modules métier, via
 * `getTenantContext` et `can`.
 */

/** En-têtes de sécurité (section 69 et 74). */
function applySecurityHeaders(response: NextResponse): NextResponse {
  const isDevelopment = process.env.NODE_ENV === "development";

  // Empêche le navigateur de déduire le type MIME d'une réponse, ce qui
  // ouvre la voie à des attaques de type « MIME sniffing ».
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Interdit l'affichage du site dans une iframe (clickjacking sur un écran
  // de caisse serait critique).
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // React et Turbopack utilisent eval() en développement pour reconstruire
  // les piles d'appel. Autoriser eval() hors production affaiblirait
  // réellement la protection contre les injections de script : la
  // directive n'est donc ajoutée que lorsque NODE_ENV n'est pas production.
  const scriptSrc = isDevelopment
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  // Le PMS ne charge aucune ressource tierce : on verrouille sur 'self'.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      // Turbopack injecte des styles en ligne au cours du développement.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );

  return response;
}

/** Routes protégées : tout le dashboard PMS. */
const PROTECTED_PREFIXES = ["/dashboard"];

/** Pages d'authentification, qui ne doivent pas rediriger vers elles-mêmes. */
const AUTH_PAGES = ["/auth/v1/login", "/auth/v2/login", "/auth/v1/register", "/auth/v2/register"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.includes(pathname);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const hasSessionCookie = request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (isProtected(pathname) && !hasSessionCookie && !isAuthPage(pathname)) {
    const loginUrl = new URL("/auth/v2/login", request.url);
    // On mémorise la destination pour y revenir après connexion.
    loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);

    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  /**
   * Le matcher exclut les fichiers statiques et les routes d'authentification
   * pour ne pas payer un proxy inutile sur chaque asset.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};