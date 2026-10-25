# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Care plan payload contract.

A care plan is a clinician-authored document, not a computed one: no model ever
touches it. That makes the payload the only thing worth guarding, so the guard
lives here as plain functions with no FastAPI, no Mongo and no third-party
imports. `tests/test_care_plan.py` exercises it offline.

Two rules this module exists to keep:

1. An absent plan is not an invented plan. `empty_plan()` returns no items and
   `source: null`, so the UI can keep its fixture label instead of rendering a
   plan no doctor wrote.
2. Nothing unvalidated reaches Mongo. Bad types, empty strings and oversized
   lists are rejected with a message that says which item and which field.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

# A plan is a page of advice, not a document dump. The caps keep a paste-happy
# client from turning one plan into a megabyte the UI has to render.
MAX_ITEMS = 20
MAX_FIELD = 2000
MAX_NOTE = 4000

SECTIONS = ("diet", "activity")
ITEM_FIELDS = ("slot", "title", "detail")


class CarePlanValidationError(ValueError):
    """A PUT body that does not match the frozen item shape."""


def _text(value: Any, field: str, limit: int) -> str:
    if not isinstance(value, str):
        raise CarePlanValidationError(
            f"{field} must be a string, got {type(value).__name__}"
        )
    text = " ".join(value.split())
    if not text:
        raise CarePlanValidationError(f"{field} must not be empty")
    if len(text) > limit:
        raise CarePlanValidationError(
            f"{field} is {len(text)} characters, limit is {limit}"
        )
    return text


def validate_items(value: Any, section: str) -> List[Dict[str, str]]:
    """Validate one section (`diet` or `activity`) and return clean items."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise CarePlanValidationError(
            f"{section} must be a list, got {type(value).__name__}"
        )
    if len(value) > MAX_ITEMS:
        raise CarePlanValidationError(
            f"{section} has {len(value)} items, limit is {MAX_ITEMS}"
        )

    items: List[Dict[str, str]] = []
    for index, raw in enumerate(value):
        if not isinstance(raw, dict):
            raise CarePlanValidationError(
                f"{section}[{index}] must be an object, got {type(raw).__name__}"
            )
        clean: Dict[str, str] = {}
        for field in ITEM_FIELDS:
            if field not in raw:
                raise CarePlanValidationError(f"{section}[{index}] is missing {field}")
            clean[field] = _text(raw[field], f"{section}[{index}].{field}", MAX_FIELD)
        # Unknown keys are dropped on purpose: the stored item shape stays fixed.
        items.append(clean)
    return items


def validate_plan_payload(payload: Any) -> Dict[str, Any]:
    """Validate a PUT body. Returns `{diet, activity, notes}` only.

    Raises `CarePlanValidationError`; the route turns that into a 400 so a bad
    body fails the same way whether Mongo is up or not.
    """
    if not isinstance(payload, dict):
        raise CarePlanValidationError(
            f"body must be an object, got {type(payload).__name__}"
        )

    notes_raw = payload.get("notes")
    if notes_raw is None:
        notes = ""
    elif not isinstance(notes_raw, str):
        raise CarePlanValidationError(
            f"notes must be a string, got {type(notes_raw).__name__}"
        )
    else:
        # A note is prose: keep the clinician's line breaks, drop blank lines.
        notes = "\n".join(
            line.strip() for line in notes_raw.splitlines() if line.strip()
        )
        if len(notes) > MAX_NOTE:
            raise CarePlanValidationError(
                f"notes is {len(notes)} characters, limit is {MAX_NOTE}"
            )

    return {
        **{section: validate_items(payload.get(section), section) for section in SECTIONS},
        "notes": notes,
    }


def empty_plan() -> Dict[str, Any]:
    """The honest empty: no plan exists, so we say so and invent nothing."""
    return {"items": [], "source": None}


def _iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def plan_from_document(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Serialise a stored plan. `items` is the flattened diet + activity list."""
    diet = [dict(item) for item in (doc.get("diet") or []) if isinstance(item, dict)]
    activity = [
        dict(item) for item in (doc.get("activity") or []) if isinstance(item, dict)
    ]
    return {
        "id": str(doc.get("_id", "")),
        "patient_id": doc.get("patient_id"),
        "diet": diet,
        "activity": activity,
        "items": diet + activity,
        "notes": doc.get("notes") or "",
        "source": doc.get("source") or "clinician",
        "author_id": doc.get("author_id"),
        "updated_at": _iso(doc.get("updated_at")),
    }
