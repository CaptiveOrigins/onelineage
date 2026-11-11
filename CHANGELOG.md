# Changelog

## Unreleased

- Chrome extension, 2026-11-10: `apps/extension` is the collector the Mac app uses (ADR 0009). It's a Manifest V3 extension with a service worker, a side panel and a toolbar button.
  - It stores nothing, and reaches the app only through Chrome's native messaging. The native host relays to the app over a Unix socket, so there's no network port.
  - Only our extension can connect. The host manifest lists only its ID, and the app checks the caller's origin again. Developer builds are trusted only from the app's Extension screen, as a recorded decision. No other extension or web page can message it.
  - The command list is fixed and short. Requests started in the extension wait for allow once, allow for this session (one kit, up to an hour, ending when Chrome closes) or deny. Grants expire, active ones show with "End now", and every hand-over is logged with its fields but not their values.
  - Match details appear only in the side panel. The toolbar button toggles privacy in the app.
  - Every run goes through the terms register, and every real DNA service is refused. This version also refuses anything but 127.0.0.1. It was built and tested only against a new mock site (`apps/extension/mock-site`) with made-up people and its own synthetic terms entry. Human pace applies: one page at a time, 30–60 s pauses, 100 pages a day, and a stop at any challenge, sign-in page or error.
  - Includes an install script for the native host, which writes only when the person runs it.

  Tested with Vitest (44 new tests): the framing, origin checks, the command list, grants and their expiry, the privacy wiring, the terms gate, the run loop against the mock site, and a static check for storage APIs. Not yet tried: the extension loaded into Chrome, and the native host installed. Collected pages stay in the app's memory for now.
- Privacy mode, 2026-11-10: stand-ins come from a map saved in the library (`privacy-names.json`), so every recording shows the same made-up names. A stand-in is never a real word in the library. Stand-ins keep patronymic endings (-sdotter, -sson) and joined prefixes (Mc, Mac, O'), and spelling variants share a root. ⌘⇧P flips privacy from anywhere. While the map loads, privacy shows nothing rather than a real name.

- Keychain backup keys, 2026-11-10: the Mac app keeps one random 32-byte backup key per library in the macOS Keychain, through Apple's `security` tool, and never passes a shell. It's created when first needed, read back before use, and stored under a hashed account so no folder names reach the Keychain. A recovery copy can be shown on request. Backups to cloud-synced folders now work, encrypted on this Mac. Limit: the Keychain item trusts the `security` tool, not the signed app, until app signing exists.

- Chromosome browser, 2026-11-10: a Chromosomes screen in the Mac app compares two family kits' raw DNA on this Mac. It draws the shared segments on chromosomes 1–22, with a table of the same segments for keyboard and screen-reader use. The demo family now uses a denser made-up panel (about 50 markers per cM). Comparisons use the chip-error tolerance.

- OneLineage for Mac, v0, 2026-11-10: `apps/desktop`, Tauri 2 with React. First launch asks for a library folder, asks once which kind of use this is (recorded in the decisions log; law-enforcement use isn't offered), and sets up two backup destinations, with a recorded confirmation for each step down. "Open a made-up demo family" makes a planted family in its own library. Its screens are Kits, Matches (a sortable, filterable, keyboard-usable table), Theory (the recorded tree drawn with OnePedigree, behind the blind gate, with the planted misattributed father as two candidates), Backups (destinations, the last checked copy, "Back up everywhere" and the verdict), and a stub for the DNA network. A Privacy switch swaps every name for a consistent stand-in. The packages run unchanged in a small Node host beside the window (ADR 0007). Tested with Vitest and in a browser against the dev host; the Mac app was built locally and opened, and its window reached the host. Not yet: a bundled Node, the Keychain (stubbed), real imports, the chromosome browser and the network graph.
- One person across services, 2026-11-10:
  - `newPersonId` gives every person a permanent random universal ID.
  - `IdentityRegistry` holds confirmed links, finds anchors (people confirmed on two or more services), and refuses a second link until the first is undone.
  - `proposeLinks` suggests same-person pairs from cM to shared family kits and names, with evidence, and drops any pair with a close runner-up. On a planted family with a made-up second service: 100% of proposals right, 59% of the shared people found. Links are never made without a person's confirmation.

- Match grouping, 2026-11-10: `@captiveorigins/onelineage-analysis` groups a kit's matches from the DNA alone, reading the importer's records and nothing from trees (ADR 0006). It ports the earlier Python method, with its own Leiden implementation (refinement phase included) and a seeded generator, so the same files and seeds give the same groups:
  - a network of matches from 20 to 400 cM, linked by shared-match cM
  - consensus groups over 30 Leiden runs
  - two-way splits per side, using only matches with 2 or more segments
  - seeded placement that leaves a match "unplaced" unless one line scores at least twice the next

  On planted families, the groups keep the sides and the grandparent lines apart, keep the misattributed father's real line apart from the other great-grandparent line, gather the intermarried community into one group, and leave unrelated small matches out. Compared with the Python method on ten planted families at two densities, the adjusted Rand index is 1.0 for the groups, 0.94 to 1.0 for the side splits, and placement is identical. It hasn't been run on real data. 62 tests.
- Raw-file extras, 2026-11-10, on made-up families only:
  - `phaseWithParent` splits a child's kit into each parent's half.
  - `rebuildFromDescendants` partly rebuilds someone who never tested. It's refused for real data without a recorded consent, and the owner's rule is pending (N126).
  - `compareHalves` compares such people through their inherited halves.
  - `xPathPossible` applies the X-DNA inheritance rule.
  - `compareKits` now skips half-known calls, which could otherwise hide breaks.

- Visual phasing chart, 2026-11-10: `phaseThreeSiblings` assigns every stretch of three siblings' chromosomes to a grandparent. It finds the best path between agreeing with the observed sibling states and having few switches. Labels are relative per chromosome: side 1 or 2, grandparent a or b. With simulated siblings and no parents, it matched the true grandparents at 93.7% of sampled positions.

- Sibling phasing building blocks, 2026-11-10: `ibdStates` reads, window by window, whether two full siblings share neither, one or both copies of each chromosome. `siblingCrossovers` attributes a crossover to one sibling when every pair with that sibling changes state there and no other pair does. With three simulated siblings and no parents, states were right over 90% of the time, and over 85% of attributed crossovers fell within 5 cM of a true one. Drawing the grandparent chart from them is the next step.

- Genetic maps and chip errors, 2026-11-10: `parsePlinkMap` reads published maps in PLINK `.map` format, interpolating within each chromosome and refusing malformed or out-of-order files. `compareKits` gains genotyping-error tolerance: an opposite homozygote with at most one other break within 50 markers on each side is treated as a likely chip error. With a 0.3% error rate, a parent and child stay whole, a relative's total stays within 10%, and a stranger stays at zero. No map is bundled yet; see docs/decisions.md.

- Hypothesis engine, 2026-11-10: `@captiveorigins/onelineage-hypothesis` scores competing family trees by simulating inheritance through each one, and reports odds with each match's contribution (ADR 0008). On a planted misattributed father it gave the biological father 98.5%, his brother 1.5% and the recorded father under 0.1%. It tells half from full siblings at 1,750 and 2,650 cM.

- Segment painting, 2026-11-10: `assignSides` puts each shared segment on the mother's or father's side, using the parents' own comparisons with the same match. `paint` lays reference relatives' segments onto ancestor lines (paths like "MP", the mother's father), and reports overlapping claims from unrelated lines as conflicts, without resolving them. Checked against the simulation's true inheritance.

- Library and backups, 2026-11-10: `@captiveorigins/onelineage-library` adds the library folder, exports stored frozen (read-only, with a manifest, never replaced), and the hash-chained decisions log, which refuses to go on after an edit. It also backs up to any number of destinations with a test-restore, encrypting with AES-256-GCM on this Mac for cloud-synced folders. Restores go only into a new folder. Pruning happens only after the newest copy checks out. The two-backup rule allows a deliberate step down. A SQLite cache can be rebuilt and compared by digest (S11).

- Kit-to-kit comparison, 2026-11-10: `compareKits` finds shared segments between two raw kits on this Mac. It ends a stretch at each opposite homozygote, and keeps stretches of at least 7 cM and 300 markers. `triangulate` finds stretches three kits share. Centimorgans use an approximate 1 cM per Mb map, and every result names the map it used. Tested against simulated truth: parent and child, a relative within 10%, a stranger at zero.

- Raw DNA importer, 2026-11-10: reads the AncestryDNA, 23andMe, MyHeritage, FamilyTreeDNA and Living DNA raw-data layouts. It records the test's stated details (chip or array version, build, date, markers, no-calls) and refuses unknown layouts and bad rows. The terms register's `site_export` is checked first. The simulator now makes up genotypes and raw files for planted families. The layouts follow the companies' public descriptions; a real downloaded file hasn't been checked against them yet.

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
