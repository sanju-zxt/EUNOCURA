"""Turn the audit we just ran into pictures: one PNG per page, boxes on the lines.

    cd backend
    python tools/render_demo_boxes.py

Reads `tools/_warm_report.json` (written by `tools/prewarm_demo.py`), takes the
`coords` of every surviving claim, and draws exactly those rectangles on the
page. This is the artifact to look at — and to show — when the question is
"does the highlight really land on the quoted line?".

Output: `backend/demo/page-1.png`, `backend/demo/page-2.png`, ...
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, ".")

from src.services.bbox import render_highlight  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
PDF = BACKEND.parent / ".agents/skills/clinical-document-intelligence/assets/sample-discharge-summary.pdf"
REPORT = BACKEND / "tools" / "_warm_report.json"
OUT_DIR = BACKEND.parent / "demo"


def main() -> int:
    if not REPORT.exists():
        print(f"no {REPORT.name}; run tools/prewarm_demo.py first")
        return 1

    report = json.loads(REPORT.read_text(encoding="utf-8"))
    by_page: dict[int, list[dict]] = {}
    for claim in report.get("claims", []):
        if claim.get("coords") and claim.get("page"):
            by_page.setdefault(int(claim["page"]), []).append(claim["coords"])

    if not by_page:
        print("no claims with coordinates in the report")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for page, rects in sorted(by_page.items()):
        out = OUT_DIR / f"page-{page}.png"
        written = render_highlight(str(PDF), page, rects, str(out), pad=2.0)
        print(f"page {page}: {len(rects)} boxes -> {written}")

    print(f"\n{sum(len(r) for r in by_page.values())} boxes over {len(by_page)} pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
