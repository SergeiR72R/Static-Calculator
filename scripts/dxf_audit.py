"""Validate generated DXF files with ezdxf (used in CI).

Usage: python scripts/dxf_audit.py <directory>

Fails if a file cannot be read, is not DXF R12 (AC1009), has audit errors,
or misses one of the required layers / uses entities outside the R12 subset.
"""
import glob
import sys

import ezdxf

LAYERS = {
    "BEAM_AXIS": 7,
    "SUPPORTS": 1,
    "LOADS": 4,
    "DIAG_M": 3,
    "DIAG_V": 5,
    "DIAG_N": 6,
    "DEFLECTION": 2,
    "TEXT": 7,
}
ALLOWED = {"LINE", "POLYLINE", "SOLID", "ARC", "CIRCLE", "TEXT"}


def check(path: str) -> list[str]:
    problems: list[str] = []
    doc = ezdxf.readfile(path)
    if doc.dxfversion != "AC1009":
        problems.append(f"version {doc.dxfversion} != AC1009")
    auditor = doc.audit()
    if auditor.has_errors:
        for e in auditor.errors:
            problems.append(f"audit error: {e.message}")
    for name, color in LAYERS.items():
        if name not in doc.layers:
            problems.append(f"layer {name} missing")
        elif doc.layers.get(name).color != color:
            problems.append(f"layer {name} color {doc.layers.get(name).color} != {color}")
    msp = doc.modelspace()
    types = {e.dxftype() for e in msp}
    if not types <= ALLOWED:
        problems.append(f"unexpected entities {sorted(types - ALLOWED)}")
    for e in msp:
        if e.dxf.layer not in LAYERS:
            problems.append(f"entity {e.dxftype()} on unknown layer {e.dxf.layer}")
            break
    texts = [e.dxf.text for e in msp.query("TEXT")]
    if not texts:
        problems.append("no TEXT entities")
    print(
        f"{path}: {doc.dxfversion} {doc.encoding} entities={len(msp)} "
        f"types={sorted(types)} fixes={len(auditor.fixes)} errors={len(auditor.errors)} "
        f"title={texts[0] if texts else ''!r}"
    )
    return problems


def main() -> int:
    files = sorted(glob.glob(f"{sys.argv[1]}/*.dxf"))
    if not files:
        print("no DXF files found")
        return 1
    failed = 0
    for f in files:
        problems = check(f)
        if problems:
            failed += 1
            for p in problems:
                print(f"  ✗ {p}")
    print(f"{len(files) - failed}/{len(files)} DXF files passed ezdxf audit")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
