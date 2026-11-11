---
site: mocksite
name: Made-up genealogy site (local mock, synthetic)
read: 2026-11-10
sources:
  - https://github.com/CaptiveOrigins/onelineage/tree/main/apps/extension/mock-site
capabilities:
  read_own_matches: allowed
  automate_page_visits: allowed
  site_export: allowed
  write_labels: allowed
  official_api: n/a
  raw_upload: n/a
---

# Made-up genealogy site (local mock, synthetic)

This is a synthetic entry, not a real service. It covers only the mock site in `apps/extension/mock-site`, which OneLineage serves itself on 127.0.0.1 with made-up people from `@captiveorigins/onelineage-simulate`. Nobody else's terms apply to it, so every capability the extension uses is `allowed` here.

The app also refuses any page visit, read or label that isn't on 127.0.0.1, whatever this file says, so this entry can't be used to reach a real site. Every real DNA service's entry says `automate_page_visits: not-allowed` or `unclear`, and those refuse.

Human pace still applies on the mock: one page at a time, a 30 to 60 second random pause between pages, a daily cap, and stopping at any challenge, sign-in page or error.
