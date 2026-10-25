# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Notification records.

One shape, defined once. The database document and the JSON the browser sees are
deliberately different: Mongo carries `_id`, the API carries `id`, and nothing
else leaks. Everything in this module is pure — no I/O, no Mongo — so the record
shape can be tested offline at the venue with no database running.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field

CATEGORIES = ("appointment", "medication", "result", "system")
DEFAULT_CATEGORY = "system"

# The frozen contract from COMPLETE-SPEC.md section 2. `_serialise` returns
# exactly these keys, in this order, so a frontend can rely on the payload and a
# stray field added by a seed script can never reach the browser.
FIELDS = ("id", "user_id", "title", "body", "category", "read", "created_at", "link")


class NotificationCreate(BaseModel):
    """Doctor-side payload.

    `patient_id` is accepted as a synonym for `user_id`: the doctor UI already
    thinks in patients, and a 422 over a field name would be a silly way to lose
    a demo. `user_id` wins when both are sent.
    """

    title: str = Field(..., min_length=1, max_length=160)
    body: str = Field(default="", max_length=4000)
    category: Literal["appointment", "medication", "result", "system"] = DEFAULT_CATEGORY
    user_id: Optional[str] = Field(default=None, max_length=64)
    patient_id: Optional[str] = Field(default=None, max_length=64)
    link: Optional[str] = Field(default=None, max_length=500)

    def target_id(self) -> Optional[str]:
        """Who the notification is for, or None for "myself" (the caller)."""
        for value in (self.user_id, self.patient_id):
            if value and value.strip():
                return value.strip()
        return None


def now_iso() -> str:
    """UTC, second precision: sorts lexicographically as well as it sorts in time."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _iso(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:  # Mongo hands back naive UTC datetimes
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat(timespec="seconds")
    if value is None:
        return ""
    return str(value)


def build_record(
    *,
    user_id: str,
    title: str,
    body: str = "",
    category: str = DEFAULT_CATEGORY,
    link: Optional[str] = None,
    read: bool = False,
    created_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a storable document. Raises ValueError on an unknown category.

    The guard is not paranoia: an unrecognised category would be silently
    coerced to "system" on the way out, so a typo would look like it worked.
    """
    if category not in CATEGORIES:
        raise ValueError(f"unknown notification category: {category!r}")
    if not str(user_id or "").strip():
        raise ValueError("user_id is required")
    return {
        "user_id": str(user_id).strip(),
        "title": str(title).strip(),
        "body": str(body or "").strip(),
        "category": category,
        "read": bool(read),
        "created_at": created_at or now_iso(),
        "link": (link or None),
    }


def _serialise(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Mongo document -> API record. `_id` becomes `id`; extra keys are dropped."""
    raw_id = doc.get("_id")
    category = doc.get("category")
    record = {
        "id": "" if raw_id is None else str(raw_id),
        "user_id": str(doc.get("user_id") or ""),
        "title": str(doc.get("title") or ""),
        "body": str(doc.get("body") or ""),
        "category": category if category in CATEGORIES else DEFAULT_CATEGORY,
        "read": bool(doc.get("read", False)),
        "created_at": _iso(doc.get("created_at")),
        "link": doc.get("link") or None,
    }
    return {key: record[key] for key in FIELDS}


# Public alias for callers that should not reach into a private name.
serialise = _serialise
