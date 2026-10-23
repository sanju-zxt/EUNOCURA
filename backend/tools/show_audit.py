# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Print a citation audit report the way a human needs to read it.

    python tools/show_audit.py <report.json>     # from a saved response
    python tools/show_audit.py --live            # POST the sample PDF and print

The second form is the one to run during rehearsal: it exercises the whole
pipeline (pdfplumber -> model offers claims -> verifier disposes) and prints the
sentence that is the entire pitch.
"""

from __future__ import annotations

import json
import os
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
DEFAULT_URL = os.getenv("AUDIT_URL", "http://127.0.0.1:8000/citations/audit")

MARK = {"supported": "[ok]  ", "page_corrected": "[fix] ", "dropped": "[DROP]"}


def show(d: dict) -> None:
    if "detail" in d:
        print(f"ERROR: {d['detail']}")
        return

    print()
    print("  " + (d.get("headline") or "(no headline)"))
    print()
    print(f"  file      {d.get('filename', '-')}")
    print(f"  model     {d.get('model', '-')}")
    print(f"  offered   {d.get('offered', '-')}   kept {d.get('supported', '-')}"
          f"   corrected {d.get('page_corrected', '-')}   dropped {d.get('dropped', '-')}")
    print(f"  coverage  {round(float(d.get('coverage') or 0) * 100)}%")
    if d.get("audit_id"):
        print(f"  stored    citation_audits/{d['audit_id']}")
    if d.get("model_error"):
        print(f"  model err {str(d['model_error'])[:160]}")
    print()

    for c in d.get("claims", []):
        mark = MARK.get(c.get("status", ""), "      ")
        quote = (c.get("quote") or "").replace("\n", " ")[:78]
        print(f"  {mark} p{c.get('page')}  {quote}")
        if c.get("status") != "supported":
            print(f"            {c.get('reason', '')}")
        if c.get("coords"):
            b = c["coords"]
            print(f"            box x{b.get('x0')} y{b.get('y0')} "
                  f"x{b.get('x1')} y{b.get('y1')}")
    print()


def live() -> dict:
    import httpx

    if not SAMPLE.exists():
        sys.exit(f"sample PDF not found: {SAMPLE}")
    print(f"POST {DEFAULT_URL}  ({SAMPLE.name}, {SAMPLE.stat().st_size} bytes)")
    with SAMPLE.open("rb") as handle:
        response = httpx.post(
            DEFAULT_URL,
            files={"file": (SAMPLE.name, handle, "application/pdf")},
            data={
                "question": "what are the vitals, labs and medications",
                "max_claims": "8",
            },
            timeout=300.0,
        )
    print(f"  http {response.status_code} in {response.elapsed.total_seconds():.1f}s")
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    if not sys.argv[1:]:
        sys.exit(__doc__)
    if sys.argv[1] == "--live":
        show(live())
    else:
        show(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
