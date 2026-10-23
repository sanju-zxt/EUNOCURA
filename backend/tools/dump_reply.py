"""Dump one full reply so we can see exactly how the thinking text is shaped."""
import os
import sys

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

for attempt in range(4):
    r = httpx.post(
        URL,
        json={
            "contents": [{"parts": [{"text": PROMPT}]}],
            "generationConfig": {"temperature": 0},
        },
        timeout=120,
    )
    if r.status_code == 200:
        text = "".join(p.get("text", "") for p in r.json()["candidates"][0]["content"]["parts"])
        open("tools/_reply_dump.txt", "w", encoding="utf-8").write(text)
        print("saved", len(text), "chars on attempt", attempt)
        print(text[-900:])
        break
    print("attempt", attempt, r.status_code)
