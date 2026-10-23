"""Which JSON mode actually works on Gemma 4, with a real document in the prompt.

Variants:
  A  responseMimeType=application/json, no schema
  B  responseMimeType=application/json + responseSchema
  C  no JSON mode at all (what the old code did)
"""
import json
import os
import sys
import time

sys.path.insert(0, ".")
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402

from src.services import page_index  # noqa: E402

KEY = os.getenv("GEMINI_API_KEY")
BASE = "https://generativelanguage.googleapis.com/v1beta/models/"
PDF = r"..\.agents\skills\clinical-document-intelligence\assets\sample-discharge-summary.pdf"

pages = page_index.index_pdf(PDF)["pages"]
DOC = "\n".join(f"[page {n}]\n{pages[n]}" for n in sorted(pages))

PROMPT = (
    "You are reading a medical document for a doctor. Offer the 5 most useful factual claims. "
    "For each, copy the SHORTEST line EXACTLY as it appears in the document and give its page "
    "number. Do not paraphrase the quote. Never diagnose. Never invent a value.\n\n"
    f"Document:\n{DOC}\n\n"
    'Return JSON only in this shape: {"claims":[{"claim":"...","quote":"...","page":1,'
    '"kind":"finding","confidence":0.9}]}'
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

VARIANTS = {
    "A_mime_only": {"temperature": 0, "responseMimeType": "application/json"},
    "B_mime_schema": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": SCHEMA},
    "C_plain": {"temperature": 0},
}

model = os.getenv("TRY_MODEL", "gemma-4-26b-a4b-it")
for name, cfg in VARIANTS.items():
    t = time.time()
    try:
        r = httpx.post(
            BASE + model + ":generateContent?key=" + (KEY or ""),
            json={"contents": [{"parts": [{"text": PROMPT}]}], "generationConfig": cfg},
            timeout=150,
        )
        dt = round(time.time() - t, 1)
        if r.status_code != 200:
            print(f"{name}: HTTP {r.status_code} {r.text[:180]}", flush=True)
            continue
        payload = r.json()
        parts = payload["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
        usage = payload.get("usageMetadata", {})
        head = text[:160].replace("\n", " ")
        ok = "PURE-JSON" if text.strip().startswith("{") else "prose-first"
        try:
            parsed = json.loads(text)
            n = len(parsed.get("claims", []))
            ok += f" parsed={n}claims"
        except Exception:
            ok += " unparseable"
        print(f"{name}: {dt}s {usage.get('candidatesTokenCount')}out {ok} :: {head}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"{name}: FAIL {round(time.time()-t,1)}s {type(exc).__name__} {str(exc)[:140]}", flush=True)
