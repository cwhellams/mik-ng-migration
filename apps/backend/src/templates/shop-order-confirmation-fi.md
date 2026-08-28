# Tilausvahvistus #{{orderId}}

Hei {{firstName}},

Kiitos tilauksestasi — vastaanotimme seuraavat tuotteet.

**Tilattu:** {{orderedAt}}

{{#if itemsTableHtml}}
**Tuotteet:**

{{{itemsTableHtml}}}

{{/if}}
**Tilauksen loppusumma:** € {{totalAmount}}

{{#if notes}}
**Lisätietosi:**

{{notes}}

{{/if}}
Otamme yhteyttä, kun tilauksesi on noudettavissa.

[button:Katso tilauksesi]({{href}})
