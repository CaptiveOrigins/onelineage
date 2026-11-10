---
site: wikitree
name: WikiTree
read: 2026-11-10
sources:
  - https://www.wikitree.com/wiki/Help:Terms_of_Service
  - https://github.com/wikitree/wikitree-api
capabilities:
  read_own_matches: n/a
  automate_page_visits: unclear
  site_export: unclear
  write_labels: unclear
  official_api: allowed
  raw_upload: n/a
---

# WikiTree

Read 2026-11-10, from public pages only, with no sign-in. The Terms of Service page could not be read: it blocks automated reads (HTTP 403). The API documentation was read.

| Capability | Verdict | Why |
| --- | --- | --- |
| `read_own_matches` | n/a | WikiTree is a shared tree, not a DNA-matching service. |
| `automate_page_visits` | unclear | The terms page is unread. The block page itself mentions abuse by AI-scraping bots. |
| `site_export` | unclear | The terms page is unread. |
| `write_labels` | unclear | The API is read-only, and edits go through the site itself. |
| `official_api` | allowed | "The WikiTree API provides read-only access to much of the profile data on the site. You can use it for your own applications that read and display the contents." An appId is expected. |
| `raw_upload` | n/a | Not a DNA-testing service. |

**Law enforcement:** Unknown until the terms are read.

**Notes:** A person needs to read the terms in a normal browser (owner item N112). The API verdict stands on the API's own documentation, and will be rechecked against the terms.
