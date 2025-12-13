# Lentokoneen varausoikeus keskeytetty

Hyvä {{firstName}},

Oikeutesi tehdä lentovarauksia on **keskeytetty** maksamattomien lentolaskujen vuoksi.

<div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0;">

**Maksamattomat lentolaskut:**

Määrä: **{{invoiceCount}}**

Kokonaissumma: **{{totalAmount}} €**

</div>

## Mitä tämä tarkoittaa

- Et voi tehdä uusia lentovarauksia ennen kuin kaikki erääntyneet lentolaskut on maksettu
  {{#if cancelledBookingsCount}}
- **{{cancelledBookingsCount}} olemassa oleva(a) varausta on peruutettu**
  {{/if}}
- Tämä keskeytys koskee vain lentokoneen varausoikeuksia
- Varausoikeutesi palautetaan automaattisesti, kun kaikki lentolaskut on maksettu

## Toimenpiteitä vaaditaan

Maksa kaikki erääntyneet lentolaskut välittömästi. Voit tarkastella ja maksaa laskujasi kirjautumalla MIK Intranetiin.

[button:Näytä laskuni]({{href}})

Jos sinulla on kysymyksiä laskuistasi tai tarvitset apua maksamisessa, ota yhteyttä laskutusosastoomme:

<a href="mailto:{{BILLING_EMAIL}}">{{BILLING_EMAIL}}</a>

Kiitos huomiostasi tähän asiaan.

Ystävällisin terveisin,
Malmin Ilmailukerho - MIK ry
