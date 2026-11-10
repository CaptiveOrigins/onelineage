# Terms register

One file per service. Each file records what that service's terms let OneLineage do: the date the terms were read, the sources, and the clauses quoted. See [ADR 0004](../docs/architecture/0004-terms-register.md).

The front-matter block at the top of each file is what the code reads. A connector can use a capability only if its verdict is exactly `allowed`. `not-allowed`, `unclear`, `n/a` and a missing entry all refuse. Unclear means no.

First read on 2026-11-10. Reread a site's terms when it changes them, and before every release.

## What the first read means

- **Automated page visits:** not allowed on any DNA service read. That means Ancestry, MyHeritage, 23andMe, GEDmatch and FamilyTreeDNA. Anything automated waits for a partnership.
- **Downloading your own raw DNA:** allowed by Ancestry, MyHeritage, 23andMe and FamilyTreeDNA. That's OneLineage's clean data path.
- **Match lists:** no service's terms mention exporting your match list. The `site_export` verdicts cover raw DNA downloads only. Whether OneLineage may import match lists that users export themselves is an open question for the owner.
