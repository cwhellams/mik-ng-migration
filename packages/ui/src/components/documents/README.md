# Document Archive — Sharable Filtered Links

The Document Archive page (`/club/documents`) supports URL search parameters so
that pre-filtered views can be bookmarked and shared as direct links.
Authentication requirements are unchanged — the page is only accessible to
logged-in users.

## URL Parameters

| Parameter      | Type                       | Example value     |
| -------------- | -------------------------- | ----------------- |
| `search`       | string                     | `annual report`   |
| `tags`         | string                     | `2024`            |
| `category`     | comma-separated string     | `financial,audit` |
| `showArchived` | boolean (`true` / omitted) | `true`            |

Parameters can be combined freely. Omitting a parameter means no filter is
applied for that field (the same as the default behaviour when opening the page
without any parameters).

## Examples

Show all documents in the _minutes_ category:

```
/club/documents?category=minutes
```

Show documents tagged `2024` in either the _financial_ or _audit_ category:

```
/club/documents?category=financial,audit&tags=2024
```

Search for documents whose title or description contains "annual report":

```
/club/documents?search=annual+report
```

Show archived documents in the _policy_ category:

```
/club/documents?category=policy&showArchived=true
```

Combine multiple parameters freely:

```
/club/documents?category=minutes&tags=2024&showArchived=false
```

> **Note:** `showArchived=false` and omitting `showArchived` are equivalent —
> only `showArchived=true` enables the archived-document view.
