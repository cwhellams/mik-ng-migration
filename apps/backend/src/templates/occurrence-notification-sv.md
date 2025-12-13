# Ny händelse rapporterad

Hej {{firstName}},

En ny händelse för flygplan {{aircraftRegistration}} har rapporterats den {{reportDate}}.

{{#if new}}
Händelsen är endast synlig för medlemmar i SMS-administratörsgruppen och måste anonymiseras innan den blir synlig för resten av säkerhetsteamet. Vänligen behandla händelsen så snart som möjligt.
{{/if}}

{{#if deadLine}}
DTO-händelsen måste behandlas inom 72 timmar. Deadline är {{deadLine}}.
{{/if}}

[button:Granska händelsen]({{href}})
