# AME-ilmoitus

{{#if isNew}}
{{submitterName}} on lähettänyt uuden AME-suosituksen "{{ameName}}" hyväksyttäväksi.
{{/if}}

{{#if isEdit}}
{{submitterName}} on ehdottanut muutosta AME-kohteeseen "{{ameName}}".
{{/if}}

{{#if isRemoval}}
{{submitterName}} on pyytänyt AME-kohteen "{{ameName}}" poistamista.

Syy: {{reason}}
{{/if}}

Ole hyvä ja tarkista se ylläpidon AME-hyväksyntäsivulla.

[button:Tarkista AME-hyväksynnät]({{href}})
