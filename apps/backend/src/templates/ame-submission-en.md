# AME notification

{{#if isNew}}
{{submitterName}} has submitted a new AME recommendation, "{{ameName}}", for approval.
{{/if}}

{{#if isEdit}}
{{submitterName}} has suggested an edit to the AME entry "{{ameName}}".
{{/if}}

{{#if isRemoval}}
{{submitterName}} has requested the removal of the AME entry "{{ameName}}".

Reason: {{reason}}
{{/if}}

Please review it in the admin AME approvals page.

[button:Review AME approvals]({{href}})
