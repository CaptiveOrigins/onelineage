---
site: ancestry
name: Ancestry (including AncestryDNA)
read: 2026-11-10
sources:
  - https://www.ancestry.com/c/legal/termsandconditions
  - https://www.ancestry.com/c/legal/lawenforcement
capabilities:
  read_own_matches: unclear
  automate_page_visits: not-allowed
  site_export: allowed
  write_labels: not-allowed
  official_api: unclear
  raw_upload: unclear
---

# Ancestry (including AncestryDNA)

Read 2026-11-10, from public pages only, with no sign-in. Terms and Conditions, effective 12 May 2026.

| Capability | Verdict | Why |
| --- | --- | --- |
| `read_own_matches` | unclear | Viewing matches is part of the service, but: "You will use other Users' content only within Ancestry Services." |
| `automate_page_visits` | not-allowed | "Not to access, acquire, copy, or monitor any portion of the Services by any manual, automated, or programmatic method that exceeds the intended standard human use of the Services." |
| `site_export` | allowed | For your own DNA data: "While there are no restrictions on how you use your DNA Data". Match-list export isn't mentioned, so it isn't covered by this verdict. |
| `write_labels` | not-allowed | The same clause on automated or programmatic methods. |
| `official_api` | unclear | No API or third-party developer program is mentioned. |
| `raw_upload` | unclear | Uploads of other companies' files aren't described. |

**Law enforcement:** Users must not use the Services "in connection with any law enforcement investigation or criminal judicial proceeding". Ancestry says it does not "allow law enforcement to use Ancestry's services to investigate crimes or to identify human remains".

**Notes:** The automation ban is qualified by "standard human use". Whether a slow, user-driven tool stays within it is a question for the legal review. Keeping match lists outside Ancestry conflicts with "only within Ancestry Services".
