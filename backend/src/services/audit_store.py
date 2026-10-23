# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Citation audit trail.

Every time the model offers claims and the verifier rules on them, one document
lands in `InterIIIT.citation_audits`: which model, which file, how many claims
survived, and the verdict on every single one — including the exact quotes we
threw away.

Why bother: the pitch is "we show our receipts". A receipts claim needs a
receipt. This collection is it, and it is also the most convincing thing to open
in MongoDB Compass while judging: `model_id`, `coverage`, `dropped`, and the
sentences that were rejected because no such line exists in the file.

Two rules, learned the hard way:
1. `record()` never raises. A demo that loses its database must still show the
   report it already computed.
2. Nothing here is trusted for correctness — the verifier already decided. This
   module only remembers what the verifier said.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src import db

COLLECTION = "citation_audits"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _collection():
    """Resolved lazily so an unreachable Mongo cannot break import time."""
    return db.db.get_collection(COLLECTION)


def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def record(
    report: Dict[str, Any],
    *,
    filename: str = "",
    question: str = "",
    source: str = "model",
) -> Optional[str]:
    """Insert one audit document. Returns its id, or None if Mongo is down."""
    doc = {
        "created_at": _now(),
        "source": source,
        "filename": filename,
        "question": question,
        "model_id": report.get("model") or "unknown",
        "headline": report.get("headline", ""),
        "page_count": report.get("page_count"),
        "offered": report.get("offered", report.get("total", 0)),
        "total": report.get("total", 0),
        "supported": report.get("supported", 0),
        "page_corrected": report.get("page_corrected", 0),
        "dropped": report.get("dropped", 0),
        "coverage": report.get("coverage", 0.0),
        "claims": report.get("claims", []),
    }
    if report.get("model_error"):
        doc["model_error"] = report["model_error"]

    try:
        result = await _collection().insert_one(doc)
        return str(result.inserted_id)
    except Exception as exc:  # noqa: BLE001 - never fail the request over storage
        print(f"  [audit] not stored ({exc.__class__.__name__}): {exc}")
        return None


async def recent(limit: int = 20) -> List[Dict[str, Any]]:
    """Newest first, without the heavy `claims` array. Empty list if Mongo is down."""
    try:
        cursor = (
            _collection()
            .find({}, {"claims": 0})
            .sort("created_at", -1)
            .limit(max(1, min(int(limit or 20), 100)))
        )
        return [_clean(doc) async for doc in cursor]
    except Exception as exc:  # noqa: BLE001
        print(f"  [audit] recent() failed ({exc.__class__.__name__}): {exc}")
        return []


async def count() -> int:
    try:
        return await _collection().count_documents({})
    except Exception:  # noqa: BLE001
        return 0
