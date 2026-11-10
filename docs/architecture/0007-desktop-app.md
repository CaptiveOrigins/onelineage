# ADR 0007: The Mac app, and where the Node code runs

Status: accepted for v0, 2026-11-10

## Context

OneLineage for Mac follows the OneOrigin pattern: Tauri 2, React and Vite in `apps/desktop`, as in OnePedigree's app. But the packages it needs aren't all web code. `@captiveorigins/onelineage-library` reads and writes the library with `node:fs`, and its cache uses `node:sqlite`. The simulator, the importers and `compareKits` are plain TypeScript and would run anywhere. The packages must stay free of app code.

Three ways were weighed:

1. **Rewrite the file work in Rust**, as Tauri commands. The packages would stay untouched, but the library's rules (frozen exports, the hash-chained decisions log, checked backups, the two-backup rule) would exist twice, in two languages, and could drift.
2. **Give the library package a file-system port**, so the web view could drive it through Tauri's fs plugin. That changes a package for the app's sake, and `node:sqlite` still has no web equivalent.
3. **A small Node host beside the window.** The packages run unchanged in Node. The window sends it one request at a time.

## Decision

Option 3.

- `apps/desktop/host/` is the host. `handlers.ts` holds every request it answers, as a fixed list. It calls the packages and adds only what the app itself needs: the app's state file, the demo library, and choosing which kits and files to read.
- The host is bundled by tsup into one file, `host-dist/host.mjs`, with the packages inside it. The Mac app ships it as a resource.
- The Rust side has one command, `host_call(method, params)`. It starts `node host.mjs` on the first request, talks to it in JSON lines over stdin and stdout, and stops it when the app quits. Requests run one at a time, off the main thread. The method name must be letters only, and the host refuses any method it doesn't list. Nothing in the window can choose a program or a path to run.
- In a browser during `pnpm dev`, the Vite dev server answers the same requests at `POST /__host`, from the same `handlers.ts`. That's for development only, never part of a build, and it refuses other origins.
- Tests call the handlers directly, on temporary folders.
- The window imports the host's types only (`host/protocol.ts`). Pure logic the window needs (stand-in names, the first-launch steps, table filters, OnePedigree documents) lives in `src/` with its own tests.
- The app's state file (`app-state.json`: which folder is the library, where the demo is, and the backup destinations per library) is kept in `~/Library/Application Support/OneLineage/`, beside where the cache goes, never in the library. It's written atomically.

## The rest of v0

- **First launch** is worked out from what's recorded, so quitting halfway resumes: choose a library folder (`initLibrary`), say which kind of use this is (recorded once as a `use-declaration` decision; law-enforcement use isn't offered), then set up backups. Two destinations are required by default. Going to one, then to none, takes one confirmation each, and each step is a `backup-bypass` decision.
- **The demo** is a planted family (`standardFamily`, seed 1), stored as frozen exports in its own library inside the app's state folder, never in the user's library. It holds each family kit's match export, a raw DNA file per kit, the tester's recorded tree as a OnePedigree document, and the planted answers.
- **Blindness holds in the app.** The theory page reads the recorded tree only after the kit is unblinded, which is a recorded decision.
- **The theory page** draws the recorded tree with `@captiveorigins/onepedigree-react`, pinned at `0.1.0-alpha.18`, the newest version on npm on 2026-11-10. The planted misattributed father is also written in OnePedigree's `uncertainParents` shape, with the recorded and biological men as candidates. That field was released in OnePedigree `0.1.0-alpha.20`, which isn't on npm yet, so the chart shows the recorded tree and the candidates are listed beside it. Their odds are placeholders and are shown as "not computed yet".
- **Privacy** swaps every name on screen for a stand-in, keyed on each word of the name, with a fresh random salt each session.

## Limits and stubs

- **Node is needed on the Mac**, version 22.13 or later (for `node:sqlite` without a flag). The app looks in `ONELINEAGE_NODE`, `/opt/homebrew/bin`, `/usr/local/bin`, then `PATH`. Before a public release this needs a bundled Node, such as a Node single-executable build as a Tauri sidecar. That adds about 40 to 100 MB, and is still to be decided.
- **Keychain storage is a stub** (`host/keys.ts`). With no keys, backups to cloud-synced folders are refused with a plain reason, and nothing is written there.
- **Raw DNA in the demo is stored unencrypted.** It's made up. ADR 0005's encryption of raw DNA waits on the Keychain, and real raw imports aren't in v0.
- **The terms register isn't loaded.** The app passes an empty register, which refuses every real service. Only planted data can be read.
- **The cache isn't built.** v0 reads the library's exports directly.
- **Backups can't be cancelled** while they run.
- **The icon is a placeholder**: the OneOrigin tile in a plain warm taupe, with no glyph, until the mark is approved.
- **No updater**, because there's no signing key yet.
- Not in v0: real-data import, the Chrome extension, the chromosome browser and the DNA network graph (a stub screen says it's coming).

## Consequences

- The packages run the same code in tests, the CLI and the app.
- The host is the one place that touches files, so file rules are enforced in one place.
- Shipping the app means shipping Node, which is the main cost of this choice.
