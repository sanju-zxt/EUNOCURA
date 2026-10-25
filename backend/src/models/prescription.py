# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Prescription documents: shapes, validation, serialisation.

Everything with a rule in it lives here as a pure function, so it can be tested
with no database and no network (`tests/test_prescriptions.py`). The route module
is only allowed to be plumbing.

Two invariants worth stating out loud:

* `_id` never leaves this layer. `to_public()` renames it to `id` and stringifies
  it, because a Mongo ObjectId in JSON is not a thing the browser can use.
* The status enum is frozen. A prescription says `active`, `completed` or
  `stopped` — no free text, no synonyms, no empty string.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel, Field

# The enum is the contract; the frontend switches on these three values.
STATUSES: tuple[str, ...] = ("active", "completed", "stopped")
DEFAULT_STATUS = "active"

Status = Literal["active", "completed", "stopped"]


def utc_now() -> str:
    """ISO-8601 UTC with seconds precision — the shape every stored timestamp uses."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def validate_status(value: Any, *, field: str = "status") -> str:
    """Normalise and validate the status enum.

    Returns the canonical lowercase value; raises ValueError with a message that
    is safe to show a client when the value is missing or unknown.
    """
    text = "" if value is None else str(value).strip().lower()
    if not text:
        raise ValueError(f"{field} is required")
    if text not in STATUSES:
        raise ValueError(f"{field} must be one of {', '.join(STATUSES)}")
    return text


def parse_date(value: Any, *, field: str = "date", allow_none: bool = False) -> Optional[str]:
    """Coerce a `YYYY-MM-DD` string (or a date/datetime) to a `YYYY-MM-DD` string.

    Dates are stored as plain calendar strings, not instants: a prescription that
    starts "2026-10-01" must not move a day because a server is in another zone.
    """
    if value is None or (isinstance(value, str) and not value.strip()):
        if allow_none:
            return None
        raise ValueError(f"{field} is required")
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        text = value.strip()[:10]
        try:
            return date.fromisoformat(text).isoformat()
        except ValueError as exc:
            raise ValueError(f"{field} must be a date in YYYY-MM-DD format") from exc
    raise ValueError(f"{field} must be a date in YYYY-MM-DD format")


def to_object_id(value: Any) -> Optional[ObjectId]:
    """Best-effort reference parsing. Returns None when the value cannot be an id."""
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        text = value.strip()
        if len(text) == 24:
            try:
                return ObjectId(text)
            except (InvalidId, TypeError):
                return None
    return None


def id_filters(value: str) -> List[Any]:
    """The `_id` values to try for one reference: ObjectId first, then the raw string.

    The users collection keys on ObjectId while our own records keep references as
    strings, so both shapes are legitimate in this codebase.
    """
    raw = str(value).strip()
    candidates: List[Any] = []
    oid = to_object_id(raw)
    if oid is not None:
        candidates.append(oid)
    candidates.append(raw)
    return candidates


def id_query(value: str) -> Dict[str, Any]:
    """Filter one document by id, tolerating either ObjectId or string `_id`."""
    return {"_id": {"$in": id_filters(value)}}


def _iso(value: Any) -> Any:
    """Serialise datetimes/dates to ISO strings; leave scalars untouched."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    return value


def to_public(doc: Dict[str, Any]) -> Dict[str, Any]:
    """ObjectId-safe copy of a stored document. Never mutates the input.

    `_id` becomes `id` (string); any other key starting with `_` is internal and
    never serialised; datetimes become ISO strings. The result is always
    JSON-serialisable.
    """
    out: Dict[str, Any] = {}
    for key, value in doc.items():
        if key == "_id":
            out["id"] = str(value)
        elif key.startswith("_"):
            continue
        else:
            out[key] = _iso(value)
    out.setdefault("id", "")
    return out


def to_public_list(docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [to_public(doc) for doc in docs]


# ---------------------------------------------------------------- request bodies


class PrescriptionCreate(BaseModel):
    """Body of `POST /prescriptions/`. Doctor and timestamps come from the token."""

    patient_id: str = Field(..., min_length=1)
    medication: str = Field(..., min_length=1)
    dosage: str = Field(..., min_length=1)
    frequency: str = Field(..., min_length=1)
    route: str = Field(default="oral")
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    instructions: str = ""
    refills_left: int = Field(default=0, ge=0)


class PrescriptionUpdate(BaseModel):
    """Body of `PATCH /prescriptions/{id}`. Every field is optional; at least one is required."""

    status: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    medication: Optional[str] = None
    instructions: Optional[str] = None
    refills_left: Optional[int] = Field(default=None, ge=0)
    end_date: Optional[str] = None

    def changes(self) -> Dict[str, Any]:
        """Validate the supplied fields into a `$set` payload, ignoring absent ones.

        Raises ValueError for an unknown status, an unparseable date, or a blank
        text field. Values are validated before anything touches Mongo.
        """
        patch: Dict[str, Any] = {}

        if self.status is not None:
            patch["status"] = validate_status(self.status)
        if "end_date" in self.model_fields_set:
            # An explicit null (or "") clears the field; an absent key leaves it alone.
            patch["end_date"] = parse_date(self.end_date, field="end_date", allow_none=True)
        if self.refills_left is not None:
            patch["refills_left"] = int(self.refills_left)

        for field in ("medication", "dosage", "frequency", "route", "instructions"):
            value = getattr(self, field)
            if value is None:
                continue
            text = str(value).strip()
            if not text and field != "instructions":
                raise ValueError(f"{field} must not be empty")
            patch[field] = text

        return patch


def build_document(payload: PrescriptionCreate, *, doctor_id: str, doctor_name: str) -> Dict[str, Any]:
    """Turn a validated create body into the stored document.

    The doctor identity and the timestamps are server-owned: a client cannot
    prescribe on behalf of somebody else by sending a `doctor_id`.
    """
    now = utc_now()
    start = parse_date(payload.start_date, field="start_date") if payload.start_date else date.today().isoformat()
    end = parse_date(payload.end_date, field="end_date", allow_none=True)
    if end is not None and end < start:
        raise ValueError("end_date must not be before start_date")

    return {
        "patient_id": str(payload.patient_id).strip(),
        "doctor_id": str(doctor_id),
        "doctor_name": doctor_name or "",
        "medication": str(payload.medication).strip(),
        "dosage": str(payload.dosage).strip(),
        "frequency": str(payload.frequency).strip(),
        "route": (payload.route or "oral").strip(),
        "start_date": start,
        "end_date": end,
        "status": validate_status(payload.status or DEFAULT_STATUS),
        "instructions": str(payload.instructions or "").strip(),
        "refills_left": int(payload.refills_left or 0),
        "created_at": now,
        "updated_at": now,
    }
