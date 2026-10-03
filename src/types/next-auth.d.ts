import "next-auth";

/**
 * Augmentation des types Auth.js.
 *
 * `user.id` est indispensable : c'est la seule voie par laquelle un module
 * métier remonte jusqu'à la session, et donc jusqu'au tenant.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
  }
}

export {};