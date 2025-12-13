# New occurrence reported

Hello {{firstName}},

New occurrence for plane {{aircraftRegistration}} has been reported at {{reportDate}}.

{{#if new}}
The occurrence is only visible to SMS admin group members and have to be anonymized before it becomes visible to the rest of the safety team. Please process the occurrence as soon as possible.
{{/if}}

{{#if deadLine}}
DTO-occurrence has to be processed in 72 hours. Deadline is at {{deadLine}}.
{{/if}}

[button:Review the occurrence]({{href}})
