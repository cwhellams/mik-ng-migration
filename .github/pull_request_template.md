<!--
Delete any section that doesn't apply. A one-line PR does not need a long body —
but the Tests line is the one to fill in properly every time. See the Testing
Policy in .github/copilot-instructions.md.
-->

## What this changes

<!-- What it does and why. Link the issue: "Closes #123" / "Part of #123". -->

## Tests

<!--
A change that alters behaviour brings tests for the behaviour it alters, in the
same PR. Say which ones, or say why not — "layout only", "config only" and
"generated file" are fine answers. "Covered by existing tests" is fine too, if
you name them.

If the change touches something behind a permission gate, it is tested against
the whole identity set (backend: admin / member / no-permissions tokens;
frontend: `authScenarios`), not just the happy path.

If it fixes a bug, there should be a test that fails without the fix.
-->

## Checks

- [ ] `pnpm format` / `pnpm format:check`
- [ ] `pnpm build`
- [ ] `pnpm test` for every app touched
- [ ] Frontend coverage bars still met (`pnpm test:coverage`), and raised in this PR if this change pushed a directory up

<!--
SQL only: new migration files only, never edits to files already on main, and the
version number is the highest existing + 10. See the copilot instructions.
-->
