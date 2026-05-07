# Malmin Ilmailukerhon lasku - {{invoiceId}}

Hei {{firstName}},

Viestin liiteenä on lasku seuraavilla tiedoilla:

- **Laskunumero:** {{invoiceId}}
- **Summa:** {{amount}} €
- **Eräpäivä:** {{dueDate}}
  {{#if reference}}
- **Viitenumero:** {{reference}}
  {{/if}}

{{#if itemsTableHtml}}
**Laskurivit:**

{{{itemsTableHtml}}}

{{/if}}

{{#if barcode}}
**Virtuaaliviivakoodi** (Vain suomalaisille pankeille):

```
{{barcode}}
```

{{#if barcodeImageHtml}}
{{{barcodeImageHtml}}}
{{/if}}

{{/if}}

{{#if qrCodeImageHtml}}
**QR-koodi** (Rajoitettu pankkien tuki toistaiseksi):

{{{qrCodeImageHtml}}}

{{/if}}

Laskusi on liitetty tähän viestiin.
