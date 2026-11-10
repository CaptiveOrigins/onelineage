#!/bin/bash
# Local leak check for OneLineage: the standard check, plus a private list of family words kept outside the repo.
# The family list lives in the owner's private Genealogy folder and is never copied here. CI runs the standard check only.
set -u
cd "$(dirname "$0")/.."
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
for f in "${LEAK_PRIVATE_TERMS:-$HOME/.leak-private-terms}" "$HOME/Documents/60 Projects/61 Genealogy/.leak-terms-onelineage"; do
  [ -f "$f" ] && grep -v -E '^\s*(#|$)' "$f" >> "$tmp"
done
LEAK_PRIVATE_TERMS="$tmp" bash scripts/leak-check.sh
