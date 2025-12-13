# Aircraft Reservation Privileges Suspended

Dear {{firstName}},

Your ability to make aircraft reservations has been **suspended** due to unpaid flight invoices.

<div style="background-color: #ffebee; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0;">
  
**Outstanding Flight Invoices:**
  
Count: **{{invoiceCount}}**

Total Amount: **{{totalAmount}} €**

</div>

## What this means

- You cannot make new aircraft reservations until all overdue flight invoices are paid
  {{#if cancelledBookingsCount}}
- **{{cancelledBookingsCount}} existing reservation(s) have been cancelled**
  {{/if}}
- This suspension only affects flight booking privileges
- Your reservation privileges will be automatically restored once all flight invoices are paid
</ul>

## Action Required

Please pay all overdue flight invoices immediately. You can view and pay your invoices by logging into the MIK Intranet.

[button:View My Invoices]({{href}})

If you have questions about your invoices or need payment assistance, please contact our billing department:

<a href="mailto:{{BILLING_EMAIL}}">{{BILLING_EMAIL}}</a>

Thank you for your prompt attention to this matter.

Best regards,
Malmin Ilmailukerho - MIK ry</p>
