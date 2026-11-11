# OneLineage

DNA-first genetic genealogy for Mac. OneLineage groups your DNA matches before your family tree can bias them, then gives odds on each possible family tree. It runs on your own Mac, with no servers and no account.

**Status:** early, and only tested on made-up families; nothing reads real data yet. Built so far:

- the design (`docs/architecture/`) and the use policy
- the terms register (`terms/`, read 2026-11-10), and the code that enforces it
- a simulator of made-up families with planted answers
- importers for Genealogy Assistant-style match lists (real Ancestry data is refused while its terms are unclear), and for raw DNA in five companies' layouts
- match grouping from the DNA alone (ADR 0006)
- kit-to-kit comparison, triangulation and segment painting
- sibling phasing, half-kits and rebuilt relatives (made-up data only)
- the hypothesis engine with odds (ADR 0008)
- the library with checked, encrypted backups
- one universal ID per person, and proposed cross-service links
- OneLineage for Mac, v0: runs on a made-up demo family. It's been built and opened locally, not released, and needs Node 22.13 or later on the Mac for now (ADR 0007).
- the Chrome extension the app collects with (`apps/extension`, ADR 0009). It stores nothing, talks to the app only through Chrome's native messaging, and asks for your OK in the app. It only works with a local mock site: every DNA service's terms say no to automated page visits. It's been tested with Vitest against the mock site, and hasn't been loaded into Chrome yet.

249 tests pass locally. The raw layouts haven't been checked against a real downloaded file. The register's verdicts are a careful reading of public pages, not legal advice, and a legal review is still to come.

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

## Commands

```bash
# The Mac app in development (needs Rust; Node 22.13 or later must be on this Mac while the app runs)
pnpm --filter onelineage-desktop app:dev

# The same screens in a browser, without the Mac shell
pnpm --filter onelineage-desktop dev

# The Chrome extension, built into apps/extension/dist (load it unpacked from chrome://extensions)
pnpm --filter onelineage-extension build

# The made-up genealogy site the extension is tested against, on 127.0.0.1:8787
pnpm --filter onelineage-extension mock-site

# Chrome's native messaging host for a developer build you've trusted in the app. Writes two files in your
# Library folder; add --dry-run to see them first
pnpm --filter onelineage-desktop build:host
node apps/desktop/host-dist/install-native-host.mjs --extension-id <id from chrome://extensions>

# A made-up family with planted answers, written as Genealogy Assistant-style CSVs plus truth.json
pnpm --filter @captiveorigins/onelineage-simulate simulate --seed 1 --out ../../fixtures/generated/planted-1
```

The simulator's limits: crossovers have no interference, matches below 8 cM and segments below 7 cM are dropped, and there's no Timber-style weighting. Weighted and unweighted cM are therefore equal, and segment lengths come from a rounded genetic map. Every name and ID is invented.

## License

Source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE), with the use restriction in its Required Notice. This license doesn't make it open source.
