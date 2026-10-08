#!/usr/bin/env bash
# Opens every generated DXF in LibreCAD (headless dxf2pdf) and checks that a PDF was produced.
# Usage: scripts/librecad_check.sh <dir-with-dxf-files>
set -euo pipefail
dir="${1:?directory}"
out="$(mktemp -d)"
cp "$dir"/*.dxf "$out"/
cd "$out"
timeout 600 xvfb-run -a librecad dxf2pdf -a ./*.dxf > librecad.log 2>&1 || { cat librecad.log; exit 1; }
fail=0
for f in ./*.dxf; do
  pdf="${f%.dxf}.pdf"
  if [[ ! -s "$pdf" ]] || [[ $(stat -c %s "$pdf") -lt 2000 ]]; then
    echo "✗ LibreCAD could not render $f"
    fail=1
  else
    echo "✓ $f → $(stat -c %s "$pdf") bytes PDF"
  fi
done
exit $fail
