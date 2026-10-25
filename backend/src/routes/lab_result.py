# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Lab results: `/lab-results/me`, `/lab-results/me/series`, `POST /lab-results/`.

Three rules this file exists to enforce:

1. `status` comes from `models.lab_result.derive_status`, never from the request.
2. A patient sees their own results and nothing else; a doctor must name the
   patient (`?patient_id=`) rather than rely on a guessed default.
3. No MongoDB means a 503 with the fix in `detail`, not a 500 with a stack trace.

Reads re-derive the status from the stored number and range, so a record whose
`status` was hand-edited in the database cannot lie through this API.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status

from src import db as dbmod
from src.middlewares.auth import check_doctor_exists, get_current_user
from src.models.lab_result import (
    LabResultCreate,
    LabResultList,
    LabResultRecord,
    SeriesPoint,
    Source,
    derive_status,
)

router = APIRouter()

COLLECTION = "lab_results"

MONGO_HINT = (
    "Lab results are stored in MongoDB, which is not reachable right now. "
    "Start a local mongod (mongodb://localhost:27017) or set MONGODB_URI; "
    "GET /healthz reports the current database state."
)

_EPOCH = datetime(1970, 1, 1)


# ---------------------------------------------------------------- helpers
def _collection():
    """Resolve the collection lazily: import time must not need a database."""
    database = getattr(dbmod, "db", None)
    if database is None:
        raise HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=MONGO_HINT)
    return database.get_collection(COLLECTION)


def _unavailable(exc: Exception) -> HTTPException:
    print(f"  [lab-results] storage unavailable ({exc.__class__.__name__}): {exc}")
    return HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=MONGO_HINT)


def _as_utc(value: datetime) -> datetime:
    """Mongo stores naive datetimes as UTC; make that explicit and never guess IST."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _iso(value: Any) -> str:
    if isinstance(value, datetime):
        return _as_utc(value).replace(tzinfo=timezone.utc).isoformat()
    if isinstance(value, str):
        return value
    return ""


def _sort_key(doc: Dict[str, Any]) -> datetime:
    taken = doc.get("taken_at")
    if isinstance(taken, datetime):
        return _as_utc(taken)
    if isinstance(taken, str):
        try:
            return _as_utc(datetime.fromisoformat(taken.replace("Z", "+00:00")))
        except ValueError:
            pass
    return _EPOCH


def build_lab_result_document(
    payload: LabResultCreate, *, now: Optional[datetime] = None
) -> Dict[str, Any]:
    """Turn a request into the document we store, ignoring `payload.status`."""
    moment = _as_utc(now) if now else _as_utc(datetime.now(timezone.utc))
    taken_at = _as_utc(payload.taken_at) if payload.taken_at else moment
    return {
        "patient_id": payload.patient_id,
        "test_name": payload.test_name,
        "value": float(payload.value),
        "unit": (payload.unit or "").strip(),
        "reference_low": payload.reference_low,
        "reference_high": payload.reference_high,
        "status": derive_status(payload.value, payload.reference_low, payload.reference_high),
        "taken_at": taken_at,
        "source": payload.source,
        "note": payload.note,
        "created_at": moment,
    }


def to_record(doc: Dict[str, Any]) -> LabResultRecord:
    raw_value = doc.get("value")
    value = float(raw_value) if isinstance(raw_value, (int, float)) else 0.0
    low = doc.get("reference_low")
    high = doc.get("reference_high")
    low = float(low) if isinstance(low, (int, float)) else None
    high = float(high) if isinstance(high, (int, float)) else None
    source: Source = doc.get("source") if doc.get("source") in ("manual", "document") else "manual"
    return LabResultRecord(
        id=str(doc.get("_id", "")),
        patient_id=str(doc.get("patient_id", "")),
        test_name=str(doc.get("test_name", "")),
        value=value,
        unit=str(doc.get("unit") or ""),
        reference_low=low,
        reference_high=high,
        status=derive_status(value, low, high),
        taken_at=_iso(doc.get("taken_at")),
        source=source,
        note=doc.get("note"),
    )


def build_series(docs: List[Dict[str, Any]]) -> Dict[str, List[SeriesPoint]]:
    """Group by test name, oldest point first — a chart reads left to right."""
    grouped: Dict[str, List[tuple[datetime, SeriesPoint]]] = {}
    for doc in docs:
        record = to_record(doc)
        point = SeriesPoint(
            t=record.taken_at, v=record.value, unit=record.unit, status=record.status
        )
        grouped.setdefault(record.test_name, []).append((_sort_key(doc), point))

    series: Dict[str, List[SeriesPoint]] = {}
    for name in sorted(grouped):
        series[name] = [point for _, point in sorted(grouped[name], key=lambda row: row[0])]
    return series


def resolve_patient_scope(user: Dict[str, Any], patient_id: Optional[str]) -> str:
    """Who is asking, and whose results may they read."""
    role = user.get("role") or user.get("user_type")
    own_id = str(user.get("_id", ""))

    if role == "doctor":
        if not patient_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="patient_id query parameter is required for a doctor view",
            )
        return patient_id

    if patient_id and patient_id != own_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Patients may only read their own lab results",
        )
    return own_id


async def _find(query: Dict[str, Any], *, sort: Optional[List[tuple[str, int]]] = None) -> List[Dict[str, Any]]:
    try:
        cursor = _collection().find(query)
        if sort:
            cursor = cursor.sort(sort)
        return [doc async for doc in cursor]
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - storage failure is a 503, not a 500
        raise _unavailable(exc)


# ---------------------------------------------------------------- routes
@router.get("/me/series", response_model=Dict[str, List[SeriesPoint]])
async def my_lab_series(
    patient_id: Optional[str] = Query(None, description="Doctor only: whose results"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Trend data: `{test_name: [{t, v, unit, status}]}`, oldest point first."""
    target = resolve_patient_scope(user, patient_id)
    docs = await _find({"patient_id": target})
    return build_series(docs)


@router.get("/me", response_model=LabResultList)
async def my_lab_results(
    test: Optional[str] = Query(None, description="Filter the list to one test name"),
    patient_id: Optional[str] = Query(None, description="Doctor only: whose results"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Own results, newest first, plus the full series for the trend chart.

    `series` always covers every test for the patient: filtering the list with
    `?test=` must not silently redraw the chart from one test only.
    """
    target = resolve_patient_scope(user, patient_id)

    query: Dict[str, Any] = {"patient_id": target}
    name = (test or "").strip()
    if name:
        query["test_name"] = name

    docs = await _find(query, sort=[("taken_at", -1)])
    series_docs = docs if not name else await _find({"patient_id": target})

    return LabResultList(
        items=[to_record(doc) for doc in docs],
        series=build_series(series_docs),
    )


@router.post("/", response_model=LabResultRecord, status_code=http_status.HTTP_201_CREATED)
async def create_lab_result(
    payload: LabResultCreate,
    _doctor: Dict[str, Any] = Depends(check_doctor_exists),
):
    """Record a result. Doctor only; `status` is recomputed here."""
    document = build_lab_result_document(payload)
    collection = _collection()
    try:
        result = await collection.insert_one(document)
    except Exception as exc:  # noqa: BLE001
        raise _unavailable(exc)

    document["_id"] = result.inserted_id
    return to_record(document)
