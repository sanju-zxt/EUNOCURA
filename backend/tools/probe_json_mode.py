"""Probe native JSON output (responseSchema) — does the thinking text go away?"""
import json
import os
import sys
import time

sys.path.insert(0, ".")
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402

KEY = os.getenv("GEMINI_API_KEY")
BASE = "https://generativelanguage.googleapis.com/v1beta/models/"

PROMPT = (
    "Read the document. Offer up to 4 factual claims a doctor would want, each with the "
    "shortest line copied exactly from the document and the page it is on.\n\n"
    "Document:\n[page 1]\nPatient: Asha Rao. BP 148/92 mmHg, HR 104 bpm, SpO2 91% on room air, "
    "temperature 38.6 C. Admitted 09 Aug 2026, discharged 12 Aug 2026.\n"
    "[page 2]\nChest X-ray shows right lower zone consolidation. Started IV ceftriaxone 1 g twice daily.\n"
)

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "claims": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "claim": {"type": "STRING"},
                    "quote": {"type": "STRING"},
                    "page": {"type": "INTEGER"},
                    "kind": {"type": "STRING"},
                    "confidence": {"type": "NUMBER"},
                },
                "required": ["claim", "quote", "page"],
            },
        }
    },
    "required": ["claims"],
}

for model in ("gemma-4-26b-a4b-it", "gemma-4-31b-it"):
    body = {
        "contents": [{"parts": [{"text": PROMPT}]}],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 1200,
            "responseMimeType": "application/json",
            "responseSchema": SCHEMA,
        },
    }
    t = time.time()
    try:
        r = httpx.post(BASE + model + ":generateContent?key=" + (KEY or ""), json=body, timeout=180)
        dt = round(time.time() - t, 1)
        j = r.json()
        parts = (j.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        usage = j.get("usageMetadata", {})
        print(f"== {model} {r.status_code} {dt}s usage={usage}", flush=True)
        print(text[:500].replace("\n", " "), flush=True)
        try:
            parsed = json.loads(text)
            print("PARSED OK claims:", len(parsed.get("claims", [])), flush=True)
        except Exception as exc:
            print("not pure json:", exc, flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"{model} FAIL {round(time.time()-t,1)}s {type(exc).__name__} {str(exc)[:200]}", flush=True)
