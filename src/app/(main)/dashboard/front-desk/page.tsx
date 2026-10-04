import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadFrontDeskSnapshot } from "@/modules/frontdesk/query";

/**
 * Écran de réception (PROMPTMVP.md section 61).
 *
 * Lecture seule : les arrivées, départs et clients présents proviennent de la
 * journée métier de l'établissement. Les actions de check-in, check-out et
 * changement de chambre sont déclenchées depuis leurs écrans dédiés et passent
 * par leurs services — cette page se contente de montrer l'état.
 */

/** Formate un montant en XOF sans perte : séparateur de milliers, pas de décimales. */
function formatAmount(amount: bigint): string {
  const digits = amount < 0n ? -amount : amount;
  const grouped = digits.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${amount < 0n ? "−" : ""}${grouped}`;
}

function formatBusinessDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-CI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function OccupancyBadge({ label, value, total }: { label: string; value: number; total: number }) {
  const ratio = total === 0 ? 0 : Math.round((value / total) * 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-muted-foreground text-xs">{ratio} % du parc</p>
      </CardContent>
    </Card>
  );
}

export default async function FrontDeskPage() {
  // La session et le périmètre sont résolus côté serveur : un utilisateur sans
  // établissement autorisé reçoit une erreur, jamais une page vide.
  const snapshot = await loadFrontDeskSnapshot();

  const { rooms, arrivals, departures, inHouse } = snapshot;
  const withBalance = inHouse.filter((stay) => stay.balanceDue > 0n);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Réception</h1>
        <p className="text-muted-foreground text-sm capitalize">
          {formatBusinessDate(snapshot.businessDate)}
        </p>
      </header>

      <section aria-label="Occupation" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OccupancyBadge label="Chambres occupées" value={rooms.occupied} total={rooms.total} />
        <OccupancyBadge label="Chambres disponibles" value={rooms.available} total={rooms.total} />
        <OccupancyBadge label="À nettoyer" value={rooms.dirty} total={rooms.total} />
        <OccupancyBadge label="Hors service" value={rooms.outOfOrder} total={rooms.total} />
      </section>
      <section aria-label="Arrivées" className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Arrivées du jour</h2>
          <Badge variant="secondary">{arrivals.length}</Badge>
        </div>

        <Card>
          <CardContent className="px-0">
            {arrivals.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">
                Aucune arrivée prévue aujourd&apos;hui.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Réservation</TableHead>
                    <TableHead>Chambre</TableHead>
                    <TableHead>Séjour</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arrivals.map((arrival) => (
                    <TableRow key={arrival.reservationId}>
                      <TableCell>
                        <span className="font-medium">{arrival.guestName}</span>
                        {arrival.isVip && (
                          <Badge variant="outline" className="ml-2 align-middle">
                            VIP
                          </Badge>
                        )}
                        {arrival.guestPhone && (
                          <p className="text-muted-foreground text-xs">{arrival.guestPhone}</p>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{arrival.reservationNumber}</TableCell>
                      <TableCell>
                        {arrival.roomNumber ?? (
                          <span className="text-muted-foreground">non attribuée</span>
                        )}
                        {arrival.roomTypeName && (
                          <p className="text-muted-foreground text-xs">{arrival.roomTypeName}</p>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {arrival.nights} nuit{arrival.nights > 1 ? "s" : ""}
                        <p className="text-muted-foreground text-xs">
                          {arrival.adults} adult{arrival.adults > 1 ? "s" : ""}
                        </p>
                      </TableCell>
                      <TableCell>
                        {arrival.status === "CHECKED_IN" ? (
                          <Badge>Présent</Badge>
                        ) : arrival.status === "OPTION" ? (
                          <Badge variant="secondary">Option</Badge>
                        ) : (
                          <Badge variant="outline">Confirmée</Badge>
                        )}
                        {/* Un dépôt exigé et non versé doit sauter aux yeux
                            avant que le client ne se présente à la réception. */}
                        {arrival.hasDeposit && (
                          <p className="text-destructive mt-1 text-xs">Dépôt non versé</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-label="Départs" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">Départs du jour</h2>
            <Badge variant="secondary">{departures.length}</Badge>
          </div>

          <Card>
            <CardContent className="px-0">
              {departures.length === 0 ? (
                <p className="text-muted-foreground p-6 text-sm">
                  Aucun départ prévu aujourd&apos;hui.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Chambre</TableHead>
                      <TableHead>Départ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departures.map((departure) => (
                      <TableRow key={departure.stayId}>
                        <TableCell>
                          <span className="font-medium">{departure.guestName}</span>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {departure.stayNumber}
                          </p>
                        </TableCell>
                        <TableCell>{departure.roomNumber ?? "—"}</TableCell>
                        <TableCell>
                          {departure.status === "CHECKED_IN" ? (
                            <Badge variant="outline">Parti</Badge>
                          ) : (
                            <Badge variant="secondary">En cours</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-label="Clients présents" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">Clients présents</h2>
            <Badge variant="secondary">{inHouse.length}</Badge>
            {withBalance.length > 0 && (
              <Badge variant="outline">{withBalance.length} avec solde</Badge>
            )}
          </div>

          <Card>
            <CardContent className="px-0">
              {inHouse.length === 0 ? (
                <p className="text-muted-foreground p-6 text-sm">Aucun client présent.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Chambre</TableHead>
                      <TableHead className="text-right">Solde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inHouse.map((stay) => (
                      <TableRow key={stay.stayId}>
                        <TableCell>
                          <span className="font-medium">{stay.guestName}</span>
                          <p className="text-muted-foreground text-xs">
                            Départ prévu le {stay.plannedCheckOut}
                          </p>
                        </TableCell>
                        <TableCell>{stay.roomNumber ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {stay.balanceDue > 0n ? (
                            <span className="font-medium tabular-nums">
                              {formatAmount(stay.balanceDue)} {stay.currency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">Soldé</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}