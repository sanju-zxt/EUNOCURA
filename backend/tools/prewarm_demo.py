"""Warm the demo, then prove the rule holds — with and without the model.

    cd backend
    python tools/prewarm_demo.py

Why: Gemma/Qwen take 20-40 s on a real document, and a demo must not wait 40 s
in front of judges. The router caches by prompt hash, so warming once here
makes the live demo answer in well under a second - and if the venue wifi or
the model host dies, the cached answer still plays.

The second half needs no model at all: `POST /citations/check` is plain Python,
so a fabricated quote is rejected in milliseconds even with the model unplugged.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
PDF = Path(__file__).resolve().parents[2] / ".agents/skills/clinical-document-intelligence/assets/sample-discharge-summary.pdf"


def post_audit(client: httpx.Client, label: str) -> dict:
    started = time.time()
    with PDF.open("rb") as handle:
        response = client.post(
            "/citations/audit",
            files={"file": (PDF.name, handle, "application/pdf")},
            data={"question": ""},
            timeout=300,
        )
    took = round(time.time() - started, 1)
    response.raise_for_status()
    data = response.json()
    print(f"{label}: {took}s  ->  {data['headline']}")
    return data


def main() -> int:
    with httpx.Client(base_url=BASE, timeout=60) as client:
        try:
            health = client.get("/citations/health").json()
        except Exception as exc:  # noqa: BLE001
            print(f"backend not running at {BASE}: {exc}")
            return 1
        print("model:", health["model"], "| pdf:", health["pdf_reader"])

        cold = post_audit(client, "cold (model)")
        warm = post_audit(client, "warm (cache)")

        report = warm
        for claim in report["claims"]:
            box = "box" if claim.get("coords") else "---"
            print(f"  {claim['status']:<14} p{claim['page']} {box}  {claim['claim'][:66]}")

        # ---- the part that needs no model: a claim with a quote that is not there
        pages_response = client.post(
            "/citations/index",
            files={"file": (PDF.name, PDF.open("rb"), "application/pdf")},
            timeout=60,
        )
        pages_response.raise_for_status()
        indexed = pages_response.json()

        fabricated = {
            "claims": [
                {
                    "claim": "Patient has no history of diabetes mellitus.",
                    "quote": "No history of diabetes mellitus.",
                    "page": 1,
                },
                {
                    "claim": "Patient was discharged on insulin.",
                    "quote": "Discharged on insulin sliding scale.",
                    "page": 2,
                },
                {
                    "claim": "HbA1c was raised.",
                    "quote": "HbA1c 8.4% (raised)",
                    "page": 1,
                },
            ],
            "pages": indexed["pages"],
            "chunks": indexed["chunks"],
        }
        started = time.time()
        verdict = client.post("/citations/check", json=fabricated, timeout=30).json()
        print(f"\nno-model check: {round(time.time()-started, 3)}s  ->  {verdict['headline']}")
        for claim in verdict["claims"]:
            print(f"  {claim['status']:<14} p{claim['page']}  {claim['quote'][:56]!r}")
            if claim["status"] == "dropped":
                print(f"                 {claim['reason']}")

        client.post("/citations/check", json=fabricated, timeout=30)
        audits = client.get("/citations/audits?limit=3").json()
        print(f"\naudit trail: {audits['count']} documents in '{audits['collection']}'")
        Path(__file__).with_name("_warm_report.json").write_text(
            json.dumps(warm, indent=2), encoding="utf-8"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
