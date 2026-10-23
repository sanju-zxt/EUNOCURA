"""Prove the boxes are real: crop every chunk's rect and read it back.

    cd backend
    python tools/verify_boxes.py

If a highlight is going to appear over a line in front of a judge, the box has
to contain that line. So we take the coordinates the API returns, crop the page
to exactly that rectangle, and compare the words that come back with the chunk
text. Nothing here trusts either side: pdfplumber produces both.

Bottom-left origin in, pdfplumber's top-left crop in between.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, ".")

import pdfplumber  # noqa: E402

from src.services import page_index  # noqa: E402

PDF = Path(__file__).resolve().parents[2] / ".agents/skills/clinical-document-intelligence/assets/sample-discharge-summary.pdf"

_WS = re.compile(r"\s+")


def words(text: str) -> str:
    return _WS.sub(" ", (text or "").replace("\u2013", "-")).strip().lower()


def main() -> int:
    data = page_index.index_pdf(PDF)
    print(f"{PDF.name}: {data['page_count']} pages, {len(data['chunks'])} chunks")

    hidden, checked, empty = 0, 0, 0
    with pdfplumber.open(str(PDF)) as pdf:
        for chunk in data["chunks"]:
            coords = chunk.get("coordinates")
            page = pdf.pages[chunk["page"] - 1]
            if not coords:
                empty += 1
                continue
            height = float(page.height)
            crop = page.crop(
                (coords["x0"], height - coords["y1"], coords["x1"], height - coords["y0"]),
                strict=False,
            )
            inside = words(crop.extract_text() or "")
            expected = words(chunk["text"])
            checked += 1
            if not inside or (inside not in expected and expected not in inside):
                hidden += 1
                print(f"  MISMATCH page {chunk['page']} rect {coords}")
                print(f"    crop says: {inside[:90]!r}")
                print(f"    chunk says: {expected[:90]!r}")

    print(f"\n{checked} boxes cropped, {hidden} did not read back, {empty} without coords")
    if hidden:
        print("  FAIL boxes and text disagree")
        return 1
    print("  PASS every highlight box contains the words it claims")
    return 0


if __name__ == "__main__":
    sys.exit(main())
