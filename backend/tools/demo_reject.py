# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""The demo beat that matters: invented claims die in front of you.

Real page text from a real PDF, plus two claims that were never written in it.
The verifier keeps what is on the page and drops what is not — with no model in
the loop, so the outcome cannot be argued with.

    python tools/demo_reject.py
    python tools/demo_reject.py --url http://127.0.0.1:8001

Run this on stage after `show_audit.py --live`. `show_audit` proves the pipeline
works; this proves the pipeline can say no, which is the actual product.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = (
    ROOT.parent
    / ".agents"
    / "skills"
    / "clinical-document-intelligence"
    / "assets"
    / "sample-discharge-summary.pdf"
)

UNSUPPORTED = [
    {
        "claim": "The patient was diagnosed with type 2 diabetes mellitus.",
        "quote": "diagnosed with type 2 diabetes mellitus",
        "page": 1,
        "kind": "history",
    },
    {
        "claim": "The patient was started on vancomycin.",
        "quote": "started on vancomycin 1 g intravenously",
        "page": 2,
        "kind": "medication",
    },
]


def first_real_sentences(pages: dict[str, str], count: int = 2):
    """Pull genuinely-present lines so the demo also shows the kept case."""
    found = []
    for page_no, text in sorted(pages.items(), key=lambda kv: int(kv[0])):
        for line in re.split(r"(?<=[.!?])\s+|\n", text):
            line = line.strip()
            if 25 <= len(line) <= 120 and re.search(r"[A-Za-z]", line):
                found.append(
                    {
                        "claim": f"Document states: {line[:60].rstrip('.')}",
                        "quote": line,
                        "page": int(page_no),
                        "kind": "finding",
                    }
                )
            if len(found) >= count:
                return found
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--pdf", default=str(SAMPLE))
    args = parser.parse_args()

    import httpx

    pdf = Path(args.pdf)
    if not pdf.exists():
        print(f"sample PDF not found: {pdf}")
        return 1

    base = args.url.rstrip("/")
    with pdf.open("rb") as handle:
        indexed = httpx.post(
            f"{base}/citations/index",
            files={"file": (pdf.name, handle, "application/pdf")},
            timeout=120.0,
        )
    indexed.raise_for_status()
    data = indexed.json()
    pages = data["pages"]
    print(f"\n  indexed {pdf.name}: {data['page_count']} page(s), "
          f"{data['char_count']} chars, {len(data['chunks'])} line boxes")

    real = first_real_sentences(pages, 2)
    claims = real + UNSUPPORTED

    report = httpx.post(
        f"{base}/citations/check",
        json={"claims": claims, "pages": pages, "chunks": data["chunks"]},
        timeout=60.0,
    )
    report.raise_for_status()
    d = report.json()

    print(f"\n  {d['headline']}\n")
    for c in d["claims"]:
        mark = {"supported": "[ok]  ", "page_corrected": "[fix] ", "dropped": "[DROP]"}
        print(f"  {mark.get(c['status'], '      ')} p{c['page']}  {c['quote'][:64]}")
        if c["status"] != "supported":
            print(f"            {c['reason']}")
    print("\n  Nothing above was decided by a model. That is the point.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
