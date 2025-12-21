# Ny händelse rapporterad

Hej {{firstName}},

En ny händelse för flygplan {{aircraftRegistration}} har rapporterats den {{reportDate}}.

{{#if new}}
Händelsen är endast synlig för oberoende granskare och måste anonymiseras innan den blir synlig för säkerhetsansvariga. Vänligen behandla händelsen så snart som möjligt.
{{/if}}

{{#if anonymized}}
Den anonymiserade händelsen är nu synlig endast för säkerhetsansvariga. Vänligen behandla händelsen så snart som möjligt och dela med andra relevanta personer.
{{/if}}

{{#if deadLine}}
Händelsen måste behandlas inom 72 timmar. Deadline är {{deadLine}}.
{{/if}}

[button:Granska händelsen]({{href}})
