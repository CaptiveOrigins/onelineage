# Decisions

Dated decisions for this repo, newest last. The fuller design plan is kept privately by the owner. Decisions that matter here are copied in without private details.

- 2026-11-10: created from the ops starter kit, area `genealogy`.
- 2026-11-09 (owner): owned by Captive Origins, part of the OneOrigin family, under PolyForm Noncommercial. TypeScript.
- 2026-11-09 (owner): **public from the start.** The owner's words: "it's fine if it's public", then "It can be public? I mentioned that". The leak check runs in CI from the first commit, and a first-public-push audit comes before the first push.
- 2026-11-09 (owner): free, Mac only, no servers. The user chooses where the library lives. Two backups by default, with a deliberate way to go down to one or none.
- 2026-11-10 (owner): implement everything technically possible without breaking any service's terms. Enforced by the terms register (ADR 0004).
- 2026-11-09 (owner): our own exporter is built and tested against a mock site. It stays off for Ancestry until there's a partnership.
- 2026-11-09 (owner): no law-enforcement use from day one. Sanctioned, verifiable investigative genetic genealogy labs and wildlife agencies are allowed. See `USE-POLICY.md`. The exact line is still open.
- 2026-11-09 (owner): raw DNA uploads to GEDmatch only, done by the tester themselves. The app checks the law-enforcement setting.
- 2026-11-09 (owner): a GitHub connector keeps the history of a user's research only. It doesn't count as a backup.
- 2026-11-10: OneLineage reads published genetic maps in PLINK `.map` format, but doesn't bundle one yet. The usual GRCh37 map, distributed with Beagle and derived from HapMap, has no license stated on its download page. HapMap dropped its click-wrap license in 2004, but whether that covers derived map files isn't confirmed. Until it is, comparisons use the approximate 1 cM per Mb rule and say so. Bundling or downloading a map waits on the owner (task K311).
