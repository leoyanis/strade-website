#!/bin/sh
# Regenerates the homepage Vaultt section's two self-hosted font subsets (vaultt-home.css loads them):
#   src/components/vaultt/fonts/bricolage-vaultt.woff2  Bricolage Grotesque, only the glyphs the section sets in it
#   src/components/vaultt/fonts/hanken-vaultt.woff2     Hanken Grotesk, Basic Latin (U+0020-007E) plus U+2019
#
# Usage:  sh scripts/fonts/subset-vaultt.sh [bricolage-latin.woff2] [hanken-latin.woff2]
# The sources are Google Fonts' latin faces of the two variable fonts (Bricolage: opsz 12-96, wght 200-800;
# Hanken: wght 100-900). Defaults: .scratch/downloads/fonts/. Needs pyftsubset (fontTools) with brotli.
#
# Why two shapes of subset:
# - Bricolage sets only the name, the tagline and the numbers, so it keeps exactly those glyphs plus every digit
#   and ". , k +" (a new VAULTT_NUMBERS value never needs a new subset). About 17 KB instead of 77 KB.
# - Hanken sets the body copy, the store buttons and the labels, which change more often: all of Basic Latin
#   and the typographic apostrophe, so new copy never falls outside it. About 23 KB instead of 35 KB.
# Both keep their variable axes (opsz drives the 72 to 128 px numerals) and every layout feature (kern, tnum).
#
# After changing the section's Bricolage copy (the name, the tagline, a number), add its characters to BRIC
# below, run this, then run the check (it fails when the page sets a character a subset lacks):
#   node scripts/fonts/check-vaultt.mjs
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_B="${1:-$ROOT/.scratch/downloads/fonts/bricolage-latin.woff2}"
SRC_H="${2:-$ROOT/.scratch/downloads/fonts/hanken-latin.woff2}"
OUT="$ROOT/src/components/vaultt/fonts"
# the name and the tagline (VaulttHome.astro), then every digit and the numbers' symbols (VAULTT_NUMBERS)
BRIC="Vaultt The network for builders. 0123456789.,k+"

for f in "$SRC_B" "$SRC_H"; do
  [ -f "$f" ] || { echo "missing source font: $f" >&2; exit 1; }
done
command -v pyftsubset >/dev/null || { echo "pyftsubset not found (pip install fonttools brotli)" >&2; exit 1; }
mkdir -p "$OUT"

pyftsubset "$SRC_B" --text="$BRIC" --layout-features='*' --flavor=woff2 --output-file="$OUT/bricolage-vaultt.woff2"
pyftsubset "$SRC_H" --unicodes='U+0020-007E,U+2019' --layout-features='*' --flavor=woff2 --output-file="$OUT/hanken-vaultt.woff2"

ls -l "$OUT"/bricolage-vaultt.woff2 "$OUT"/hanken-vaultt.woff2
