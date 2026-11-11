# Test audit

Kept by this repo's owning session (Genealogy), per `~/Code/CLAUDE.md`, "Test self-audits". Newest first.

## 2026-11-10: first full audit (253 tests)

**Promises checked:** the safeguards S1–S12 (ADR 0003), the terms register (ADR 0004), the library and backups (ADR 0005), the extension's security model (ADR 0009), the use policy, and privacy mode.

**Covered:**
- **S1 blindness:**
  - The importer seals tree files and tree-source columns while a kit is blind.
  - The app's theory page needs a recorded unblind first.
  - Privacy names never read trees while a kit is blind.
- **S2 planted families:**
  - Simulated sharing falls in published ranges.
  - Planted answers are in the DNA.
  - Clustering, painting, phasing and the hypothesis engine each find them.
- **S3 reproducibility:** identical output from the same seed, for the simulator, clustering (also with shuffled input) and the hypothesis engine.
- **S4, S5 import checks:** columns, ranges, encoding, duplicates, counts and cross-file references, each one refusing the whole import. This covers match lists, raw DNA in five layouts, and collected pages.
- **S11 rebuild check:** a cache that drifts on disk is found and rebuilt. Frozen exports that are changed, deleted or added to are reported.
- **S12 provenance:** each record carries its file, the file's SHA-256 and its row; clustering stamps its inputs and settings.
- **Terms register:**
  - Real files load.
  - Misspelled or missing verdicts fail loudly.
  - Every real service is refused for automation, labels and collection.
  - Real Ancestry match lists are refused.
- **Library and backups:**
  - The decisions log refuses an edit or a missing line.
  - Encryption round-trips; a wrong key fails.
  - Cloud folders need a key.
  - Restores never overwrite.
  - The two-backup rule steps down one confirmation at a time.
  - Keychain keys are tested with a pretend Keychain.
- **Extension:**
  - Framing.
  - Origin checks in the app and the native host.
  - The fixed command list.
  - Grants: once, session, expiry, end now.
  - The daily cap.
  - Stop at a challenge or sign-in page.
  - No storage APIs.
  - A run's end reported once.
- **Use policy:** law enforcement can't be recorded as a use. A minor's GEDmatch kit needs a second confirmation.
- **Privacy:**
  - Stand-ins are consistent, saved and reloaded, never a real library word, and keep the name's shape.
  - Years and places are masked.
  - Summaries and due messages carry no names.

**Gaps added today:**
- A frozen export with a file removed or a file added is reported. Before this, only a changed file was tested.
- A recent full run means no yearly rerun is due, even when the last export is old.

**Gaps skipped, and why:**
- **S6, spot checks against a service's own pages:** they need automated visits to real services, which the terms register refuses. Revisit with a partnership.
- **S7, genetic sanity across family kits:** not built yet. Kit-to-kit relationships come from DNA in the comparison code, but nothing yet checks them against the scheduling table. Filed as a task.
- **S8, the stability report between runs:** not built, since there's only one run so far. Filed as a task.
- **S9, claims checked against the data:** theories aren't stored as data yet. Filed as a task.
- **S10, the owner approves theory status changes:** no theory editing exists yet. It's part of S9's task.
- **Native-only behaviour:** the Mac notification, the menu item, the folder picker, the real Keychain, and the extension inside Chrome. These need the running app or the owner's Chrome, so they're listed for a by-hand test before the first release.
- **Real data of any kind:** deliberately untested until the owner's question N101 is answered.
