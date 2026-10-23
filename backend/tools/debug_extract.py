"""Debug one claim-extraction call: what exactly came back, and how long."""
import json
import sys
import time

sys.path.insert(0, ".")

from src.services import claim_extractor, page_index  # noqa: E402
from src.llm import router  # noqa: E402

PDF = r"..\.agents\skills\clinical-document-intelligence\assets\sample-discharge-summary.pdf"
data = page_index.index_pdf(PDF)
text = "\n".join(f"[page {n}]\n{data['pages'][n]}" for n in sorted(data["pages"]))
print("doc chars:", len(text))
print("model:", router.model_label())

prompt = claim_extractor.PROMPT.format(n=5, document=text, question_line="")
t = time.time()
raw = router._gemini_json(prompt, claim_extractor.SCHEMA, None)
print("elapsed", round(time.time() - t, 1))
print(json.dumps(raw, indent=1)[:1500])
