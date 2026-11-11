# ADR 0009: The Chrome extension, and how it's locked down

Status: accepted for v0, 2026-11-10

## Context

OneLineage for Mac needs a way to collect matches from the sites people use. The owner decided on 2026-11-10 that a Chrome extension does the collecting for the app, and set its limits (see `docs/decisions.md`). The terms register (ADR 0004) says no DNA service allows automated page visits, so this version is built and tested only against a made-up site on 127.0.0.1.

## Decision

`apps/extension` is a Manifest V3 extension in TypeScript, built with tsup: a service worker, a side panel and a toolbar button. The app's side lives in the desktop Node host, in `apps/desktop/host/extension/`.

### How the two talk

```
extension ──Chrome native messaging──▶ native host (native-host.mjs) ──Unix socket──▶ app's Node host (bridge.ts)
```

- The extension opens one native messaging port (`chrome.runtime.connectNative`). Chrome starts the native host and passes it the caller's origin.
- The native host is a relay. It checks the origin has the shape of an extension origin, then passes messages to the running app over a Unix socket at `~/Library/Application Support/OneLineage/extension.sock`. The socket is readable by this user only. There's no network port, localhost included.
- The app's host (`bridge.ts`) owns every rule. If the app isn't open, the relay says so and exits.
- Messages to and from Chrome use Chrome's framing: a 32-bit little-endian length, then UTF-8 JSON (`framing.ts`). Messages to Chrome are capped at 1 MB.
- The wire protocol is one file, `apps/desktop/host/extension/wire.ts`, and both sides import it.

### Locked down

1. **Only our extension.** The host manifest's `allowed_origins` lists only our extension's IDs, so Chrome won't start the host for anything else. The app checks the origin again and refuses any ID it doesn't trust. The published ID (`PUBLISHED_EXTENSION_ID`) is null until there's a Chrome Web Store listing.
2. **Nothing else can message the extension.** Its manifest has `externally_connectable: { "ids": [] }` with no `matches`. It registers no external message handlers. The side panel connection is accepted only from the extension's own page.
3. **Developer builds** are trusted only from the app's settings (the Extension screen). Trusting one needs a confirmation and is recorded as an `extension-developer-id` decision in the library's decisions log. Untrusting is recorded the same way.
4. **A fixed, short command list**, with no way to read the library or run anything:
   - started in the app: `startRun`, `stopRun`, `applyLabels` (an approved batch only), `setPrivacy`
   - started in the extension: `matchSummary` (for the side panel), `newMatchesToFetch`, `pageExport` (a page's own export block)
   - two notices that carry no data: `privacyButton` (the toolbar button) and `runReport` (why a run stopped)

   Anything else is refused, and the data is never touched.

### The owner's OK

- A request started in the extension waits in the app, which shows a dialog with three answers: **Allow once**, **Allow for this session**, **Deny**. If nobody answers in 2 minutes, the answer is no.
- A session grant covers one kit. It ends when Chrome closes the connection, or after 1 hour, whichever is first. While one is active, every screen shows it with **End now**.
- Every grant carries an expiry. When it passes, the extension drops what it showed under that grant, and the app tells it the grant has ended.
- A run started in the app carries its own run grant. That grant covers that run's page hand-overs and its fetch list, and nothing else. A match summary still needs an OK.
- **The minimum goes across.** A match summary is exactly the match's line, a confidence and theory names, with no names and no lists. A list of matches goes across only as the fetch list for a run, and it's capped at the pages left today.
- **Every hand-over is logged** in `extension-handovers.jsonl` in the app's folder, and on the Extension screen. Each entry records the time, the direction, what was handed over, the kit, how many records, which fields and which grant allowed it. Values are never logged.

### Match details stay in the side panel

The extension never writes into a website's page, because other extensions can read page content. Its only in-page code reads two things and writes nothing: the page's declared kind (`<body data-page-kind>`) and its export block. Summaries are shown only in the side panel. A test checks that the extension's code has no DOM-writing calls apart from the side panel's own page.

### It stores nothing

There's no `storage` permission, and there's no chrome.storage, localStorage, sessionStorage, IndexedDB, Cache Storage or cookies. Data passes through the service worker in memory only. A test scans the source and the built extension for every storage API, and checks the manifest's permissions: `nativeMessaging`, `sidePanel` and `scripting`, with host access to `http://127.0.0.1/*` only. The daily page count is kept by the app, in its own state file.

### Terms first

- `startRun` needs `automate_page_visits` and `read_own_matches` from the register, and `applyLabels` needs `automate_page_visits` and `write_labels`. A page hand-over needs `read_own_matches` for the site the page came from. Real services' web addresses map to their register entries, so a refusal names the entry that refused.
- Every real DNA service's entry says `not-allowed` or `unclear` for automated page visits, so all of them are refused. A site with no entry is refused too.
- **This version also refuses anything that isn't `http://127.0.0.1:<port>`**, whatever the register says. That rule is in the app, and again in the extension's run loop, its page reader and its manifest's host permissions.
- The mock site has its own synthetic register entry, `mocksite` (`apps/extension/mock-site/mocksite.md`, with a copy in `host/extension/terms.ts` that a test keeps identical). It isn't in `terms/`, because it isn't a real service, and a real file can't take its name.

### Human pace, even on the mock

One page at a time in one tab, with a random pause of 30 to 60 seconds between pages. The cap is 100 pages a day, counted by the app. A run stops at once at a challenge, a sign-in page, an error, a page off the run's site, the day's cap, the end of its grant, or "Stop" in the app. Tests may pass a shorter pause to the run loop. Nothing the app sends can change the pace.

### Privacy

The extension's toolbar button sends `privacyButton`. The app flips its own privacy switch, the one in its toolbar, and sends `setPrivacy` back. The extension then shows "P" on its badge and "Privacy on" in the side panel. Stand-in names are made in the app. Summaries carry no names today, so there's nothing for them to replace yet.

### Installing the native host

`node apps/desktop/host-dist/install-native-host.mjs --extension-id <id>` writes two files, and only when the person runs it. The first is a launcher in `~/Library/Application Support/OneLineage/native-host/`. The second is Chrome's manifest in `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/org.captiveorigins.onelineage.json`. `--dry-run` prints them without writing anything. The committed template is `apps/desktop/native-host/org.captiveorigins.onelineage.json.template`, and a test keeps it in step with the code.

## What's mocked or not done

- **No real site, ever, in this version.** Only the mock site (`apps/extension/mock-site`) was used, with made-up people from `@captiveorigins/onelineage-simulate` (seed 1, the same family as the app's demo).
- **Not tried in Chrome.** The extension builds, but it hasn't been loaded into a browser. The Chrome glue in `background.ts` (tabs, scripting, the side panel, the badge) has no automated test. The logic behind it (`core.ts`, `run-loop.ts`, `page.ts`) is tested in Node, with `fetch` standing in for a browser tab.
- **The native host wasn't installed.** The relay, the socket and the framing are tested end to end in Node, with a fake stdin standing in for Chrome.
- **Collected pages stay in memory** in the app's host for the session. Writing them into the library as frozen exports comes later.
- **Match summaries are thin.** The line is the service's own side label, the confidence says "not computed yet", and there are no theory names, because the app doesn't link matches to theories yet.
- **The app has no screen for approving label batches yet**, so `applyLabels` is reachable from the host and tests only.
- **There's no Chrome Web Store listing**, so `PUBLISHED_EXTENSION_ID` is null. A listing is public, so it waits for the owner.
- **Same-user processes:** the socket is protected by file permissions only. Any program running as this user could connect and claim a trusted origin. Such a program could also read the library directly, so this isn't a new exposure, but it is a limit.

## Consequences

- Turning on any real site takes three reviewed changes: its register entry, the app's loopback rule, and the extension's host permissions. A quiet change can't do it.
- The app is the one place that decides. The extension carries out what it's told, and only that.
