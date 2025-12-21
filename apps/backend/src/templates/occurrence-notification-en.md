# New occurrence reported

Hello {{firstName}},

New occurrence for plane {{aircraftRegistration}} has been reported at {{reportDate}}.

{{#if new}}
The occurrence is only visible to independent reviewers and have to be anonymized before it becomes visible to the safety managers. Please process the occurrence as soon as possible.
{{/if}}

{{#if anonymized}}
The anonymized occurrence is now visible now only to safety managers. Please process the occurrence as soon as possible and share to other relevant people.
{{/if}}

{{#if deadLine}}
Occurrence has to be processed in 72 hours. Deadline is at {{deadLine}}.
{{/if}}

[button:Review the occurrence]({{href}})
