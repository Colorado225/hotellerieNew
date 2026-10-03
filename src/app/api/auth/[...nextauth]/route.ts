import { handlers } from "@/lib/auth";

/**
 * Routes Auth.js (convention `/api/auth/[...nextauth]`).
 *
 * Elles fournissent le login, la déconnexion et la lecture de session avec
 * les protections CSRF intégrées à la bibliothèque.
 */
export const { GET, POST } = handlers;