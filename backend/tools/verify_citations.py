"""End-to-end check of the citation pipeline through the real app object.

Run from backend/:  python tools\verify_citations.py
No server, no reload loop, no port juggling. Real model call, real PDF.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, ".")

from fastapi.testclient import TestClient  # noqa: E402

from src.server import app  # noqa: E402

PDF = Path(__file__).resolve().parents[2] / ".agents/skills/clinical-document-intelligence/assets/sample-discharge-summary.pdf"

client = TestClient(app)

print("health:", json.dumps(client.get("/citations/health").json(), indent=1))

t = time.time()
with PDF.open("rb") as handle:
    response = client.post(
        "/citations/audit",
        files={"file": (PDF.name, handle, "application/pdf")},
        data={"question": "", "max_claims": "10"},
    )
elapsed = round(time.time() - t, 1)
print(f"\naudit -> {response.status_code} in {elapsed}s")
if response.status_code != 200:
    print(response.text[:800])
    raise SystemExit(1)

data = response.json()
for key in ("headline", "total", "offered", "supported", "dropped", "page_corrected", "coverage", "model", "page_count", "model_error"):
    print(f"  {key}: {data.get(key)}")

for claim in data.get("claims", []):
    coords = "box" if claim.get("coords") else "no-box"
    print(f"  [{claim['status']:<14}] p{claim['page']} {coords} :: {claim['claim'][:64]}")
    print(f"                   quote: {(claim.get('quote') or '')[:72]}")
    if claim["status"] == "dropped":
        print(f"                   why:   {claim['reason']}")

Path("tools/_last_audit.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
print("\nsaved tools/_last_audit.json")
