# Orderbekräftelse #{{orderId}}

Hej {{firstName}},

Tack för din beställning — vi har tagit emot följande.

**Beställd:** {{orderedAt}}

{{#if itemsTableHtml}}
**Produkter:**

{{{itemsTableHtml}}}

{{/if}}
**Ordersumma:** € {{totalAmount}}

{{#if notes}}
**Dina anteckningar:**

{{notes}}

{{/if}}
Vi hör av oss när din beställning kan hämtas.

[button:Visa din beställning]({{href}})
