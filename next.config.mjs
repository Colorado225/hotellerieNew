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
        destination: "/auth/v2/login",
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
