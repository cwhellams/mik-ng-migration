# Uusi poikkema ilmoitettu

Hei {{firstName}},

Uusi poikkema koneelle {{aircraftRegistration}} on ilmoitettu aikaan {{reportDate}}.

{{#if new}}
Poikkema on näkyvissä vain riippumattomille tarkastajille ja se on anonymisoitava ennen kuin se tulee näkyväksi turvallisuuspäälliköille. Ole hyvä ja käsittele poikkema mahdollisimman pian.
{{/if}}

{{#if anonymized}}
Anonymisoitu poikkema on nyt näkyvissä vain turvallisuuspäälliköille. Ole hyvä ja käsittele poikkema mahdollisimman pian ja jaa se muille asiaankuuluville henkilöille.
{{/if}}

{{#if deadLine}}
Poikkeman käsittely on tehtävä 72 tunnissa. Määräaika päättyy {{deadLine}}.
{{/if}}

[button:Tarkastele poikkeamaa]({{href}})
