import NextAuth from "next-auth";

import { authConfig } from "@/modules/auth/config";

/**
 * Point d'entrée Auth.js (PROMPTMVP.md section 68).
 *
 * Expose `auth`, `signIn`, `signOut` et `handlers`. Les routes REST
 * correspondantes sont montées sur `/api/auth/[...nextauth]` par la
 * convention Auth.js : même contrat, même gestion de session.
 */
export const { auth, signIn, signOut, handlers } = NextAuth(authConfig);