# OneLineage

DNA-first genetic genealogy for Mac. OneLineage groups your DNA matches before your family tree can bias them, then gives odds on each possible family tree. It runs on your own Mac, with no servers and no account.

**Status:** just started, and nothing is built yet. This repo holds the design so far: the architecture decision records in `docs/architecture/`, the use policy, and the terms register, which is still being filled in. There's no code yet, so nothing has been tested.

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

Not yet. The project will be a pnpm workspace (Node 22 or later, TypeScript).

## License

Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE), with the use restriction in its Required Notice. This license doesn't make it open source.
