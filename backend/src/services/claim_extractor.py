"""The only model call in the citation path.

The model is asked for claims that each carry a verbatim quote and a page
number. It never sees the citation checker, it never gets to grade itself, and
whatever it says is thrown away unless the quote is literally on the page.

That single constraint is the whole project: the model proposes, plain string
work disposes.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from src.llm import router

MAX_DOC_CHARS = 45000

PROMPT = """You are reading a medical document on behalf of a doctor.

Read the document below. Offer the {n} most useful factual claims a doctor would
want, then for each one give the SHORTEST line copied CHARACTER FOR CHARACTER
from the document that supports it, and the page number that line is on. Copy
the line exactly as it appears. Do not paraphrase the quote. Do not summarise.
If you cannot find an exact line for a claim, do not offer that claim at all.

Never diagnose, never recommend treatment, never invent a number. Only restate
what is written and point at where it is written.

Document:

{document}
{question_line}
Return JSON only:
{{"claims": [{{"claim": "plain sentence", "quote": "exact line from the document",
  "page": 1, "kind": "finding|measurement|date|medication|history",
  "confidence": 0.0}}]}}
"""

QUESTION_LINE = """
The doctor specifically asked: {question}
Prefer claims that answer this. Ignore it if the document does not address it.
"""

SCHEMA: Dict[str, Any] = {
    "claims": [
        {
            "claim": "string",
            "quote": "string",
            "page": 0,
            "kind": "string",
            "confidence": 0.0,
        }
    ]
}


def _clamp(text: str, limit: int = MAX_DOC_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "\n[document truncated]"


def extract_claims(
    document_text: str,
    question: str = "",
    max_claims: int = 10,
) -> List[Dict[str, Any]]:
    """Model offers claims. Nothing here is trusted; `citations.verify` decides."""
    prompt = PROMPT.format(
        n=max_claims,
        document=_clamp(document_text),
        question_line=QUESTION_LINE.format(question=question) if question.strip() else "",
    )
    data = router.ask_json(prompt, schema=SCHEMA, cache=True)

    if isinstance(data, dict):
        raw = data.get("claims", [])
    elif isinstance(data, list):
        raw = data
    else:
        raw = []

    claims: List[Dict[str, Any]] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        if not str(item.get("claim", "")).strip():
            continue
        claims.append(item)
    return claims[:max_claims]


def answer_with_receipts(
    document_text: str,
    pages: Dict[int, str],
    chunks: List[Dict[str, Any]],
    question: str = "",
    max_claims: int = 10,
) -> Dict[str, Any]:
    """Full pipeline: model offers claims, verifier keeps only what is written.

    The model call is allowed to fail — a failed model gives an empty report,
    never a fabricated one.
    """
    from src.services import citations

    try:
        offered = extract_claims(document_text, question=question, max_claims=max_claims)
        error = ""
    except router.ModelUnavailable as exc:
        offered = []
        error = str(exc)

    report = citations.verify(offered, pages, chunks)
    out = report.to_dict()
    out["model"] = router.model_label()
    out["offered"] = len(offered)
    if error:
        out["model_error"] = error
    return out
