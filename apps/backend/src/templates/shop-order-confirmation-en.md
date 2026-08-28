# Order confirmation #{{orderId}}

Hi {{firstName}},

Thank you for your order — here is what we received.

**Ordered:** {{orderedAt}}

{{#if itemsTableHtml}}
**Items:**

{{{itemsTableHtml}}}

{{/if}}
**Order total:** € {{totalAmount}}

{{#if notes}}
**Your notes:**

{{notes}}

{{/if}}
We will be in touch once your order is ready for collection.

[button:View your order]({{href}})
