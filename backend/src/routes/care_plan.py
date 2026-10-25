# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Care plan routes.

    GET /care-plan/me                 patient's own plan (empty, not invented)
    PUT /care-plan/me                 doctor only — upsert one plan per patient
    GET /care-plan/patient/{id}       doctor only — read before editing

The collection is `care_plans`, one document per patient. Mongo is resolved
lazily so the API still boots with no database; an unreachable Mongo answers
503 with the fix in `detail` instead of a 500 stack trace.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from src import db as dbmod
from src.middlewares.auth import check_doctor_exists, get_current_user
from src.models.care_plan import (
    CarePlanValidationError,
    empty_plan,
    plan_from_document,
    validate_plan_payload,
)

router = APIRouter()

COLLECTION = "care_plans"

MONGO_HINT = (
    "Care plan storage is unavailable. Start a local mongod "
    "(mongodb://localhost:27017) or set MONGODB_URI, then retry."
)


def _collection():
    """Resolved per call so an unreachable Mongo cannot break import time."""
    return dbmod.db.get_collection(COLLECTION)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _unavailable(exc: Exception) -> HTTPException:
    print(f"  [care-plan] mongo unavailable ({exc.__class__.__name__}): {exc}")
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"{MONGO_HINT} ({exc.__class__.__name__})",
    )


def _user_id(user: Dict[str, Any]) -> str:
    return str(user.get("_id", ""))


async def _assert_patient_exists(patient_id: str) -> None:
    """A plan written onto an unknown id is a plan nobody can ever open."""
    try:
        try:
            query = {"_id": ObjectId(patient_id), "role": "patient"}
        except Exception:
            query = {"_id": patient_id, "role": "patient"}
        patient = await dbmod.user_collection.find_one(query, {"_id": 1})
    except Exception as exc:  # noqa: BLE001 - surface as degraded storage
        raise _unavailable(exc)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient {patient_id} not found",
        )


@router.get("/me")
async def get_my_care_plan(user=Depends(get_current_user)):
    """Own plan. No plan is `{"items": [], "source": null}` — never a sample."""
    try:
        doc = await _collection().find_one({"patient_id": _user_id(user)})
    except Exception as exc:  # noqa: BLE001
        raise _unavailable(exc)

    if not doc:
        return empty_plan()
    return plan_from_document(doc)


@router.get("/patient/{patient_id}")
async def get_patient_care_plan(patient_id: str, _=Depends(check_doctor_exists)):
    """Doctor's read of a patient's plan, so an edit starts from the real text."""
    try:
        doc = await _collection().find_one({"patient_id": patient_id})
    except Exception as exc:  # noqa: BLE001
        raise _unavailable(exc)

    if not doc:
        return empty_plan()
    return plan_from_document(doc)


@router.put("/me")
async def put_my_care_plan(
    payload: Dict[str, Any] = Body(...),
    patient_id: Optional[str] = Query(None, description="Target patient (doctors)."),
    doctor=Depends(check_doctor_exists),
):
    """Upsert the plan this doctor is writing. One plan per patient, always.

    The body may carry `patient_id`; the query parameter wins when both are set.
    Validation runs before Mongo, so a malformed body is a 400 even offline.
    """
    body_patient_id = payload.get("patient_id")
    target = (patient_id or "").strip() or (
        body_patient_id.strip() if isinstance(body_patient_id, str) else ""
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="patient_id is required (query parameter or body field)",
        )

    try:
        plan = validate_plan_payload(payload)
    except CarePlanValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        )

    await _assert_patient_exists(target)

    now = _now()
    record = {
        "patient_id": target,
        "diet": plan["diet"],
        "activity": plan["activity"],
        "notes": plan["notes"],
        "author_id": _user_id(doctor),
        "source": "clinician",
        "updated_at": now,
    }

    try:
        collection = _collection()
        await collection.update_one(
            {"patient_id": target},
            {"$set": record, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        doc = await collection.find_one({"patient_id": target})
    except Exception as exc:  # noqa: BLE001
        raise _unavailable(exc)

    if not doc:  # Mongo accepted the write but lost it — say so, do not fake it.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Care plan was written but could not be read back. Retry the save.",
        )
    return plan_from_document(doc)
