"""Raw REST timing probe. Run from backend/ with the .env loaded."""
import json
import os
import sys
import time

sys.path.insert(0, ".")
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402

KEY = os.getenv("GEMINI_API_KEY")
URL = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key=" + (KEY or "")

PROMPT = (
    "Read this: '[page 1] BP 148/92 mmHg, HR 104 bpm, SpO2 91%.' "
    "Return JSON only: {\"claims\":[{\"claim\":\"...\",\"quote\":\"...\",\"page\":1}]}"
)

for model in ("gemma-4-26b-a4b-it", "gemma-4-31b-it"):
    for think in (None, 0):
        body = {
            "contents": [{"parts": [{"text": PROMPT}]}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 300},
        }
        if think is not None:
            body["generationConfig"]["thinkingConfig"] = {"thinkingBudget": think}
        t = time.time()
        try:
            r = httpx.post(URL.format(m=model), json=body, timeout=120)
            dt = round(time.time() - t, 1)
            j = r.json()
            text = ""
            try:
                text = j["candidates"][0]["content"]["parts"][0]["text"]
            except Exception:
                text = json.dumps(j)[:200]
            print(f"{model} think={think} :: {r.status_code} in {dt}s :: {text[:220]!r}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"{model} think={think} :: FAIL {round(time.time()-t,1)}s {type(exc).__name__} {str(exc)[:160]}", flush=True)
