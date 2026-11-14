# ADR 0005: The library, a rebuildable cache, and backups

Status: accepted, 2026-11-10

## Decision

- **The library** is a folder the user chooses. It holds everything that matters, as plain files readable without the app:
  - raw exports (frozen and checksummed)
  - raw DNA files, encrypted, with the key in the macOS Keychain
  - reports
  - `decisions.jsonl`: an append-only log of every confirmed identity link, approval, unblinding and label batch
- **The database** is SQLite, kept in `~/Library/Application Support/OneFamily/`, never in the library. It's a cache, rebuilt from the library at any time. So the library can sit in a synced folder without a sync service corrupting a live database.
- **Backups:**
  - Two destinations with a checked copy are required by default.
  - A user can deliberately go down to one, or to none, with a separate confirmation for each step. The app says plainly what would be lost.
  - Copies to cloud-synced folders are encrypted before they're written.
  - Every backup is test-restored.
- A private GitHub repo can hold the history of a user's research as text. It doesn't count as a backup.

## Consequences

- Losing the cache loses nothing.
- There are no servers of ours anywhere in the design.
