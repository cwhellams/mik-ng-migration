# Flygplansreservationsrättigheter har upphävts

Bästa {{firstName}},

Din möjlighet att göra flygplansreservationer har <strong>upphävts</strong> på grund av obetalda flygfakturor.

<div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0;">

**Utestående flygfakturor:**

Antal: **{{invoiceCount}}**

Totalt belopp: **{{totalAmount}} €**

</div>

## Vad detta betyder

- Du kan inte göra nya flygplansreservationer förrän alla förfallna flygfakturor är betalda
  {{#if cancelledBookingsCount}}
- **{{cancelledBookingsCount}} befintlig(a) reservation(er) har avbokats**
  {{/if}}
- Detta upphävande påverkar endast flygbokningsrättigheter
- Dina reservationsrättigheter kommer automatiskt att återställas när alla flygfakturor är betalda

## Åtgärd krävs

Vänligen betala alla förfallna flygfakturor omedelbart. Du kan visa och betala dina fakturor genom att logga in på MIK Intranet.

[button:Visa mina fakturor]({{href}})

Om du har frågor om dina fakturor eller behöver hjälp med betalning, vänligen kontakta vår faktureringsavdelning:

<a href="mailto:{{BILLING_EMAIL}}">{{BILLING_EMAIL}}</a>

Tack för din snabba uppmärksamhet på detta ärende.

Med vänliga hälsningar,
Malmin Ilmailukerho - MIK ry
