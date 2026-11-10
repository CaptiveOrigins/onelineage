# Changelog

## Unreleased

- First importer, 2026-11-10: `@captiveorigins/onelineage-connectors` reads Genealogy Assistant-shaped match lists and shared-match files, checking these before keeping anything:
  - the terms register (real Ancestry match data stays refused while its terms are unclear)
  - columns and values, with the whole import refused on any problem
  - unique IDs, and shared-match files that match the list
  - checksums and rows on every record
  - tree files stay sealed while a kit is blind

  The core gains the blind-first gate and the record types. 41 tests across the three packages.

- Planted test families, 2026-11-10: `@captiveorigins/onelineage-simulate` simulates made-up families with known answers. They include a misattributed father, a half-sibling line, double cousins, an intermarried community and unrelated small matches. It exports them in Genealogy Assistant's CSV shapes, with a `truth.json`. Reproducible from a seed. 13 tests check realistic sharing against published averages, and that the planted answers are really in the DNA.

- Terms register, 2026-11-10: nine services read from public pages, with quotes, in `terms/`. `@captiveorigins/onelineage-core` parses the register and refuses any capability whose verdict isn't exactly `allowed` (13 tests).

- Repo started, 2026-11-10: architecture decision records 0001–0005, the use policy and the license.
