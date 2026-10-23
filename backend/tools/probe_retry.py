"""Three quick attempts at mime-only JSON on the real 2-page document."""
import os
import sys
import time

sys.path.insert(0, ".")
from dotenv import load_dotenv  # noqa: E402

load_dotenv()
import httpx  # noqa: E402

from src.services import page_index  # noqa: E402

KEY = os.getenv("GEMINI_API_KEY", "")
pages = page_index.index_pdf(
    r"..\.agents\skills\clinical-document-intelligence\assets\sample-discharge-summary.pdf"
)["pages"]
DOC = "\n".join("[page %d]\n%s" % (n, pages[n]) for n in sorted(pages))

PROMPT = (
    "Read the document below. List 5 factual claims a doctor would want, each with a quote "
    "copied exactly from the text and the page number it appears on.\n\n"
    'Return JSON only: {"claims":[{"claim":"..","quote":"..","page":1}]}\n\n'
    + DOC
)

URL = "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent?key=" + KEY

for i in range(3):
    started = time.time()
    try:
        r = httpx.post(
            URL,
            json={
                "contents": [{"parts": [{"text": PROMPT}]}],
                "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
            },
            timeout=90,
        )
        print(i, r.status_code, round(time.time() - started, 1), r.text[:220].replace("\n", " "), flush=True)
    except Exception as exc:  # noqa: BLE001
        print(i, "FAIL", round(time.time() - started, 1), type(exc).__name__, flush=True)
