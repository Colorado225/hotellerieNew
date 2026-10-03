import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "LagoonKey",
  version: packageJson.version,
  copyright: `© ${currentYear}, LagoonKey.`,
  meta: {
    title: "LagoonKey — PMS hôtelier : réservations, séjour et équipes",
    description:
      "LagoonKey est un PMS hôtelier : réservation, check-in, check-out, folio et planning des équipes, en multi-tenant.",
    url: "https://lagoonkey.com",
  },
};
