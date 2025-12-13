# Uusi poikkema ilmoitettu

Hei {{firstName}},

Uusi poikkema koneelle {{aircraftRegistration}} on ilmoitettu aikaan {{reportDate}}.

{{#if new}}
Poikkema on näkyvissä vain SMS-ylläpitäjäryhmän jäsenille ja se on anonymisoitava ennen kuin se tulee näkyväksi muulle turvallisuustiimille. Ole hyvä ja käsittele poikkema mahdollisimman pian.
{{/if}}

{{#if deadLine}}
DTO-poikkeman käsittely on tehtävä 72 tunnissa. Määräaika päättyy {{deadLine}}.
{{/if}}

[button:Tarkastele poikkeamaa]({{href}})
