# New shop order #{{orderId}}

**Member:** {{memberName}} ({{memberEmail}})

**Ordered:** {{orderedAt}}

{{#if itemsTableHtml}}
**Items:**

{{{itemsTableHtml}}}

{{/if}}
**Order total:** € {{totalAmount}}

{{#if notes}}
**Notes from the member:**

{{notes}}

{{/if}}
[button:View order]({{href}})
