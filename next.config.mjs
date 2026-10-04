/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async redirects() {
    return [
      // La landing page du template a été retirée : la racine conduit
      // directement à l'écran de connexion. Un PMS n'a pas de page
      // d'accueil publique.
      {
        source: "/",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: "/dashboard/front-desk",
        permanent: false,
      },
      // Les écrans d'authentification vivent désormais à `/login` et
      // `/register` (pages.md section 2). Les anciennes adresses du template
      // sont conservées en redirection pour ne pas casser les liens en ligne.
      {
        source: "/auth/v2/login",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/auth/v2/register",
        destination: "/register",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
