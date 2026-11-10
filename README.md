# OneLineage

DNA-first genetic genealogy for Mac. OneLineage groups your DNA matches before your family tree can bias them, then gives odds on each possible family tree. It runs on your own Mac, with no servers and no account.

**Status:** just started. Built so far: the design (`docs/architecture/`), the use policy, and the terms register (`terms/`, read 2026-11-10), with the code that enforces it. Its 13 tests pass locally. Nothing reads real data yet. The register's verdicts are a careful reading of public pages. They aren't legal advice, and a legal review is still to come.

## What it will do

- Collect your matches from the testing services you use, as far as each service's terms allow.
- Group them from the DNA alone, with your tree kept out until you choose to unblind.
- Check for misattributed parents and half relationships, and place small matches.
- Build possible family trees with odds, and track your working theories against the evidence.
- Keep everything as plain files in a folder you choose, with backups to two places by default.

It's part of the [OneOrigin](https://github.com/CaptiveOrigins/onephylogeny/blob/main/docs/oneorigin/README.md) family. Family trees are drawn with OnePedigree's views.

## Who may use it

See [USE-POLICY.md](USE-POLICY.md). It's for family research, your own or someone else's. Law-enforcement use isn't allowed, except through an appropriately sanctioned lab.

## Build

```bash
pnpm install
pnpm test
```

A pnpm workspace: Node 22 or later, TypeScript, Vitest.

## License

Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE), with the use restriction in its Required Notice. This license doesn't make it open source.
