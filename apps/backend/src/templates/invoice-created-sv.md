# MIK Ny faktura - {{invoiceId}}

Hej {{firstName}},

Du har en ny faktura med följande uppgifter:

- **Fakturanummer:** {{invoiceId}}
- **Belopp:** € {{amount}}
- **Förfallodatum:** {{dueDate}}
  {{#if reference}}
- **Referens:** {{reference}}
  {{/if}}

{{#if itemsTableHtml}}
**Fakturarader:**

{{{itemsTableHtml}}}

{{/if}}

{{#if barcode}}
**Virtuell streckkod** (Endast för finska banker):

```
{{barcode}}
```

{{#if barcodeImageHtml}}
{{{barcodeImageHtml}}}
{{/if}}

{{/if}}

{{#if qrCodeImageHtml}}
**QR-kod** (Begränsat bankstöd för tillfället):

{{{qrCodeImageHtml}}}

{{/if}}

Din faktura finns bifogad.
