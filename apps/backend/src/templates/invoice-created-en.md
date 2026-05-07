# MIK New Invoice - {{invoiceId}}

Hi {{firstName}},

You have a new invoice with the following details:

- **Invoice number:** {{invoiceId}}
- **Amount:** € {{amount}}
- **Due date:** {{dueDate}}
  {{#if reference}}
- **Reference:** {{reference}}
  {{/if}}

{{#if itemsTableHtml}}
**Items:**

{{{itemsTableHtml}}}

{{/if}}

{{#if barcode}}
**Virtual barcode** (Only for Finnish banks):

```
{{barcode}}
```

{{#if barcodeImageHtml}}
{{{barcodeImageHtml}}}
{{/if}}

{{/if}}

{{#if qrCodeImageHtml}}
**QR code** (Limited bank support for now):

{{{qrCodeImageHtml}}}

{{/if}}

Please find your invoice attached.
