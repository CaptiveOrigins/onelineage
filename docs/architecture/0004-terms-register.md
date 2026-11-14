# ADR 0004: The terms register

Status: accepted, 2026-11-10

## Context

Decided by the owner, 2026-11-10: OneFamily implements everything technically possible without breaking any service's terms. Terms change, and they're easy to forget.

## Decision

- `terms/<site>.md` holds one file per service. Each file records the date the terms were read, the source URLs, the exact clauses quoted, and a verdict for each capability. The verdicts are `allowed`, `not-allowed` or `unclear`.
- The capabilities are:
  - `read_own_matches`
  - `automate_page_visits`
  - `site_export`
  - `write_labels`
  - `official_api`
  - `raw_upload`
- The verdicts sit in a small front-matter block that the engine parses. A connector asks for a capability before using it. Anything other than `allowed` refuses, and tests cover the refusal.
- Unclear means no, until a lawyer or a partnership says otherwise.
- The register is reread when a service changes its terms, and at least at each release.

## Consequences

- An Ancestry exporter can be built and tested against a mock site while staying switched off for Ancestry, as decided by the owner on 2026-11-09.
- Changing what the app may do on a site is a reviewed edit to one file, with quotes, never a quiet code change.
