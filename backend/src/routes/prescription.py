# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Prescriptions API.

    GET   /prescriptions/me                     patient: own; doctor: ?patient_id=
    GET   /prescriptions/patient/{patient_id}   doctor only
    POST  /prescriptions/                       doctor only
    PATCH /prescriptions/{prescription_id}      doctor only

Access rules, and why they are shaped this way:

* A patient sees only their own prescriptions, keyed off the token — the path
  never accepts a patient id from a patient, so there is nothing to tamper with.
* A doctor may read a patient's prescriptions only if the two have at least one
  document in `appointments`. That check is one indexed `find_one` over a
  compound filter, cheap enough to run per request, and it is the same rule the
  chatbot already enforces (`services/chatbot_context.verify_doctor_patient_access`).
* Creating or updating a prescription requires the doctor role; a record always
  carries the doctor who wrote it, taken from the token rather than the body. The
  appointment check is not repeated on writes: the demo's "prescribe" action must
  work from a patient panel that may not have booked a visit yet, and the write is
  attributable, so it can be audited after the fact.

Mongo being down is a 503 with a readable fix, never a traceback: `/healthz` says
the same thing about the connection.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from src import db as dbmod
from src.middlewares.auth import check_doctor_exists, get_current_user
from src.models.prescription import (
    PrescriptionCreate,
    PrescriptionUpdate,
    build_document,
    id_filters,
    id_query,
    to_public,
    to_public_list,
    utc_now,
)

router = APIRouter()

COLLECTION = "prescriptions"
APPOINTMENTS = "appointments"
USERS = "users"

MAX_ITEMS = 200

MONGO_HINT = (
    "MongoDB is unreachable, so prescriptions cannot be served. Start it "
    "(mongod --dbpath <your data dir>) or set MONGODB_URI in backend/.env, then retry. "
    "GET /healthz reports the connection state."
)

NOT_FOUND = "Prescription not found"


# ---------------------------------------------------------------- plumbing


def _collection():
    """Resolved per request: an unreachable Mongo must not break import time."""
    return dbmod.db.get_collection(COLLECTION)


def _mongo_down(exc: Exception) -> HTTPException:
    print(f"  [prescriptions] mongo unavailable ({exc.__class__.__name__}): {exc}")
    return HTTPException(status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE, detail=MONGO_HINT)


def _actor(user: Dict[str, Any]) -> str:
    return str(user.get("_id", ""))


def _role(user: Dict[str, Any]) -> str:
    return str(user.get("role") or user.get("user_type") or "patient").lower()


def _doctor_name(user: Dict[str, Any]) -> str:
    return str(user.get("full_name") or user.get("name") or "")


# ---------------------------------------------------------------- access


async def _doctor_has_appointment(doctor_id: str, patient_id: str) -> bool:
    """True when these two have any appointment on file. One query, compound filter."""
    collection = dbmod.db.get_collection(APPOINTMENTS)
    found = await collection.find_one(
        {"doctor_id": {"$in": id_filters(doctor_id)}, "patient_id": {"$in": id_filters(patient_id)}},
        {"_id": 1},
    )
    return found is not None


async def _require_patient_access(doctor_id: str, patient_id: str) -> None:
    if not await _doctor_has_appointment(doctor_id, patient_id):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access denied. No appointment links this doctor to that patient.",
        )


async def _require_patient_exists(patient_id: str) -> None:
    users = dbmod.db.get_collection(USERS)
    found = await users.find_one({"_id": {"$in": id_filters(patient_id)}, "role": "patient"}, {"_id": 1})
    if found is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Patient not found")


async def _list_for(patient_id: str) -> Dict[str, Any]:
    """Newest first, with the real total even when the page is capped."""
    query = {"patient_id": {"$in": id_filters(patient_id)}}
    collection = _collection()
    total = await collection.count_documents(query)
    cursor = collection.find(query).sort([("created_at", -1), ("_id", -1)]).limit(MAX_ITEMS)
    items = await cursor.to_list(length=MAX_ITEMS)
    return {"items": to_public_list(items), "total": total}


# ---------------------------------------------------------------- routes


@router.get("/me")
async def my_prescriptions(
    patient_id: Optional[str] = Query(None, description="Required when the caller is a doctor"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """A patient's own list. A doctor asking for "me" must name the patient."""
    actor_id = _actor(user)
    try:
        if _role(user) == "doctor":
            if not patient_id:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="patient_id is required for a doctor",
                )
            await _require_patient_access(actor_id, patient_id)
            return await _list_for(patient_id)
        return await _list_for(actor_id)
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise _mongo_down(exc) from exc


@router.get("/patient/{patient_id}")
async def patient_prescriptions(patient_id: str, doctor: Dict[str, Any] = Depends(check_doctor_exists)):
    """A patient's list, for the doctor who is treating them."""
    try:
        await _require_patient_access(_actor(doctor), patient_id)
        return await _list_for(patient_id)
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise _mongo_down(exc) from exc


@router.post("/", status_code=http_status.HTTP_201_CREATED)
async def create_prescription(
    payload: PrescriptionCreate,
    doctor: Dict[str, Any] = Depends(check_doctor_exists),
):
    """Write one prescription. Doctor and timestamps are server-owned."""
    try:
        await _require_patient_exists(payload.patient_id)
        document = build_document(payload, doctor_id=_actor(doctor), doctor_name=_doctor_name(doctor))
        result = await _collection().insert_one(document)
        document["_id"] = result.inserted_id
        return to_public(document)
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise _mongo_down(exc) from exc


@router.patch("/{prescription_id}")
async def update_prescription(
    prescription_id: str,
    payload: PrescriptionUpdate,
    doctor: Dict[str, Any] = Depends(check_doctor_exists),
):
    """Change status, dosage, frequency, route, refills or notes. Author or treating doctor."""
    try:
        patch = payload.changes()
    except ValueError as exc:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not patch:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Nothing to update. Send status, dosage, frequency, route, medication, "
                   "instructions, refills_left or end_date.",
        )

    query = id_query(prescription_id)
    try:
        existing = await _collection().find_one(query)
        if existing is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)

        author_id = str(existing.get("doctor_id", ""))
        if author_id != _actor(doctor):
            await _require_patient_access(_actor(doctor), str(existing.get("patient_id", "")))

        patch["updated_at"] = utc_now()
        updated = await _collection().find_one_and_update(
            query, {"$set": patch}, return_document=ReturnDocument.AFTER
        )
        if updated is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
        return to_public(updated)
    except HTTPException:
        raise
    except PyMongoError as exc:
        raise _mongo_down(exc) from exc
