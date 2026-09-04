#!/usr/bin/env bash
# Guard: the generation-2 sources under classic/ stay byte-identical to the
# v2.1-classic-final tag (the last classic main). vite.config.js is the one
# tooling file that was edited for the new home and is checked separately.
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:-v2.1-classic-final}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git archive "$TAG" index.html src tools design design.md design-qa.md dist/index.html | tar -x -C "$tmp"
fail=0
for p in index.html src tools design design.md design-qa.md; do
    if ! diff -rq "$tmp/$p" "classic/$p" >/dev/null; then echo "  differs: classic/$p"; fail=1; fi
done
if ! diff -q "$tmp/dist/index.html" dist/classic/index.html >/dev/null; then echo "  differs: dist/classic/index.html"; fail=1; fi
if ! diff -q "$tmp/dist/index.html" public/generations/v2/index.html >/dev/null; then echo "  differs: public/generations/v2/index.html"; fail=1; fi
if [[ $fail -ne 0 ]]; then echo "CLASSIC FROZEN CHECK: FAILED — classic files differ from $TAG"; exit 1; fi
echo "CLASSIC FROZEN CHECK: OK (classic/ and dist/classic identical to $TAG)"
