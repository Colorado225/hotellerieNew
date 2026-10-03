import { permanentRedirect } from "next/navigation";

/**
 * Point d'entrée du dashboard.
 *
 * La réception (front desk) est l'écran le plus ouvert de la journée pour
 * un hôtel : arrivées, départs, chambres disponibles, Cleaning. La
 * redirection conduit donc directement vers cette vue (section 61 du cahier
 * des charges).
 */
export default function Page() {
  permanentRedirect("/dashboard/front-desk");
}