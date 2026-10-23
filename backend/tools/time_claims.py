"""Time a claim-extraction call against the live model. Run from backend/."""
import os
import sys
import time

sys.path.insert(0, ".")
os.environ["GEMINI_MODEL"] = os.getenv("TRY_MODEL", "gemma-4-31b-it")

from src import config  # noqa: E402
import importlib  # noqa: E402

importlib.reload(config)
from src.llm import router  # noqa: E402

importlib.reload(router)

DOC = (
    "[page 1]\n"
    "Patient: Asha Rao. BP 148/92 mmHg, HR 104 bpm, SpO2 91% on room air, "
    "temperature 38.6 C. Admitted 09 Aug 2026, discharged 12 Aug 2026.\n"
    "[page 2]\n"
    "Chest X-ray shows right lower zone consolidation. Started IV ceftriaxone 1 g twice daily.\n"
)

PROMPT = (
    "Read the document below. Offer up to 4 factual claims a doctor would want, each with "
    "the shortest line copied exactly from the document and its page number.\n\n"
    f"Document:\n{DOC}\n\n"
    'Return JSON only: {"claims":[{"claim":"...","quote":"...","page":1,'
    '"kind":"finding|measurement|date|medication","confidence":0.9}]}'
)

print("model:", router.model_label())
t = time.time()
try:
    data = router.ask_json(PROMPT, schema={"claims": []}, cache=False)
    print("elapsed", round(time.time() - t, 1), "s")
    print(str(data)[:900])
except Exception as exc:  # noqa: BLE001
    print("FAILED", round(time.time() - t, 1), "s", type(exc).__name__, str(exc)[:400])
