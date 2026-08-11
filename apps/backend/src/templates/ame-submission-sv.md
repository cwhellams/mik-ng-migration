# AME-meddelande

{{#if isNew}}
{{submitterName}} har skickat in en ny AME-rekommendation, "{{ameName}}", för godkännande.
{{/if}}

{{#if isEdit}}
{{submitterName}} har föreslagit en ändring av AME-posten "{{ameName}}".
{{/if}}

{{#if isRemoval}}
{{submitterName}} har begärt att AME-posten "{{ameName}}" tas bort.

Anledning: {{reason}}
{{/if}}

Vänligen granska det på administratörens AME-godkännandesida.

[button:Granska AME-godkännanden]({{href}})
