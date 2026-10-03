# Catalogue des événements métier

Version de cadrage : 0.1  
Périmètre : événements persistés par outbox transactionnelle pour le MVP et ses extensions.

## Enveloppe commune

```json
{
  "id": "uuid",
  "type": "reservation.confirmed",
  "version": 1,
  "occurredAt": "2026-10-02T12:00:00.000Z",
  "tenantId": "uuid",
  "hotelId": "uuid",
  "actorUserId": "uuid",
  "aggregateType": "Reservation",
  "aggregateId": "uuid",
  "correlationId": "uuid",
  "payload": {}
}
```

Les événements sont écrits dans `OutboxEvent` dans la même transaction que l’agrégat métier. Un worker les publie après commit. Un événement peut être livré plusieurs fois : l’`id` est la clé d’idempotence de chaque consommateur. Les payloads contiennent des identifiants et des montants nécessaires, pas de nom complet, pièce d’identité, numéro de carte ni secret.

## Réservations et séjours

| Événement               | Déclencheur                                   | Payload minimal                                                                                         | Consommateurs MVP / ultérieurs                    |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `reservation.created`   | Réservation persistée                         | `reservationId`, `bookingNumber`, `guestId`, `roomIds`, `checkIn`, `checkOut`, `currency`, `totalMinor` | Audit, tableau de bord ; notification ultérieure  |
| `reservation.confirmed` | Validation des disponibilités et confirmation | `reservationId`, `bookingNumber`, `roomIds`, `checkIn`, `checkOut`                                      | Notification ultérieure, reporting                |
| `reservation.modified`  | Dates, chambres ou occupants modifiés         | `reservationId`, `changedFields`, `version`                                                             | Audit, synchronisation future                     |
| `reservation.cancelled` | Annulation autorisée                          | `reservationId`, `reasonCode`, `releasedRoomIds`                                                        | Disponibilité, remboursement à traiter, reporting |
| `reservation.no_show`   | No-show validé par un agent                   | `reservationId`, `releasedRoomIds`                                                                      | Disponibilité, reporting                          |
| `stay.checked_in`       | Check-in transactionnel terminé               | `reservationId`, `stayIds`, `roomIds`, `occurredAt`                                                     | Housekeeping, audit, écran réception              |
| `stay.checked_out`      | Check-out transactionnel terminé              | `reservationId`, `stayIds`, `roomIds`, `folioId`                                                        | Création tâche ménage, audit, reporting           |

## Folio, paiement et caisse

| Événement             | Déclencheur                                    | Payload minimal                                                                     | Consommateurs MVP / ultérieurs  |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| `folio.charge_added`  | Charge validée dans le folio                   | `folioId`, `entryId`, `category`, `amountMinor`, `currency`                         | Recalcul de lecture, audit      |
| `payment.recorded`    | Paiement confirmé en caisse ou par prestataire | `paymentId`, `folioId`, `method`, `amountMinor`, `currency`, `status`               | Caisse, reporting, reçu         |
| `payment.failed`      | Refus ou échec définitif                       | `paymentId`, `provider`, `failureCode`                                              | Alerte opérateur, rapprochement |
| `payment.refunded`    | Remboursement confirmé                         | `paymentId`, `originalPaymentId`, `amountMinor`, `currency`                         | Folio, caisse, audit            |
| `cash_session.opened` | Session de caisse ouverte                      | `cashSessionId`, `openedByUserId`, `openingAmountMinor`                             | Audit                           |
| `cash_session.closed` | Clôture et comptage enregistrés                | `cashSessionId`, `closedByUserId`, `expectedMinor`, `countedMinor`, `varianceMinor` | Rapport de caisse, alerte écart |

## Chambres et opérations

| Événement                           | Déclencheur                                    | Payload minimal                                             | Consommateurs MVP / ultérieurs           |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `housekeeping.task_created`         | Tâche créée par départ ou agent                | `taskId`, `roomId`, `taskType`, `priority`                  | Vue gouvernante, notification ultérieure |
| `housekeeping.task_assigned`        | Affectation à un membre                        | `taskId`, `assigneeUserId`                                  | Vue gouvernante                          |
| `housekeeping.task_completed`       | Ménage marqué terminé                          | `taskId`, `roomId`, `completedByUserId`                     | Inspection, tableau de bord              |
| `housekeeping.task_inspected`       | Inspection validée                             | `taskId`, `roomId`, `inspectedByUserId`, `result`           | Disponibilité, audit                     |
| `room.operational_status_changed`   | Chambre bloquée, nettoyée ou remise en service | `roomId`, `previousStatus`, `newStatus`, `reasonCode`       | Planning, audit                          |
| `maintenance.ticket_created`        | Ticket créé                                    | `ticketId`, `roomId`, `priority`, `category`                | Responsable maintenance, audit           |
| `maintenance.ticket_status_changed` | Statut de ticket changé                        | `ticketId`, `previousStatus`, `newStatus`, `assigneeUserId` | Responsable, reporting                   |

## Règles de publication

- Ne pas publier avant commit ; écrire l’outbox dans la transaction de commande.
- Garder `type` stable et faire évoluer le payload avec `version` explicite.
- Ne pas utiliser les événements comme remplacement des lectures transactionnelles : l’API relit PostgreSQL pour répondre à une mutation.
- Les notifications externes, OTA et rapprochements opérateurs sont des consommateurs ultérieurs, avec retry borné, dead-letter et visibilité d’échec.
- Les événements de paiement sont émis uniquement selon le statut métier vérifié ; une requête fournisseur reçue deux fois ne crée jamais deux paiements.
