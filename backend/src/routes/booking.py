# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Patient-side booking.

`routes/appointment.py` was written for the doctor portal: it only lets a doctor
create a visit, and its read routes were unauthenticated. A patient could not book
anything, so the booking screen could only ever show fixture doctors.

These three routes close that without touching the doctor flow:

    GET   /appointments/bookable-doctors       authenticated: the directory to book from
    POST  /appointments/self                   patient only: book for yourself
    PATCH /appointments/{appointment_id}/cancel patient only: cancel your own future visit

Timestamps match the rest of the app: naive IST datetimes, because that is what
`POST /appointments/` has always written and every reader compares them as strings.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src.db import appointment_collection, user_collection
from src.middlewares.auth import get_current_user

router = APIRouter()

IST = timezone(timedelta(hours=5, minutes=30))
SLOT_MINUTES = 30
CANCELLABLE = ("scheduled", "in_progress", "paused")


class BookAppointmentRequest(BaseModel):
    """Only what a patient actually chooses. Everything else is server-owned."""

    doctor_id: str = Field(..., min_length=1)
    appointment_date: date
    start_time: str = Field(..., description="24-hour HH:MM in IST")
    chief_complaint: str = Field("", max_length=500)


def _parse_slot(value: str) -> time:
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(value.strip(), fmt).time()
        except ValueError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="start_time must look like HH:MM (24-hour, IST)",
    )


def _iso(value):
    return value.isoformat() if isinstance(value, datetime) else value


def _public(doc: dict) -> dict:
    """String ids and ISO timestamps, never `_id` or a password hash."""
    out = {k: v for k, v in doc.items() if k != "_id"}
    out["id"] = str(doc.get("_id"))
    for key in ("appointment_date", "start_time", "end_time", "created_at", "updated_at"):
        if key in out:
            out[key] = _iso(out[key])
    return out


@router.get("/bookable-doctors")
async def bookable_doctors(user=Depends(get_current_user)):
    """Doctor directory for the booking form. Projected: no hashes, no emails."""
    try:
        cursor = user_collection.find(
            {"role": "doctor"},
            {"full_name": 1, "specialization": 1, "years_experience": 1, "gender": 1},
        ).limit(50)
        doctors = []
        async for doc in cursor:
            doctors.append(
                {
                    "id": str(doc["_id"]),
                    "name": doc.get("full_name", "Doctor"),
                    "specialization": doc.get("specialization", "General"),
                    "years_experience": doc.get("years_experience"),
                }
            )
        return doctors
    except Exception as exc:
        print(f"Error listing bookable doctors: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB is unreachable, so the doctor directory cannot be listed.",
        )


@router.post("/self", status_code=status.HTTP_201_CREATED)
async def book_for_self(payload: BookAppointmentRequest, user=Depends(get_current_user)):
    """A patient books a slot for themselves.

    `patient_id` is taken from the token, never from the body, so this route cannot
    create a visit in someone else's record. Status, timestamps and the id are
    server-owned.
    """
    if user.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only a patient can book for themselves.",
        )

    slot = _parse_slot(payload.start_time)
    starts_at = datetime.combine(payload.appointment_date, slot)
    if starts_at < datetime.now(IST).replace(tzinfo=None) - timedelta(hours=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That slot is in the past. Pick a future date and time.",
        )

    try:
        try:
            doctor = await user_collection.find_one({"_id": ObjectId(payload.doctor_id)})
        except Exception:
            doctor = None
        if not doctor or doctor.get("role") != "doctor":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No doctor with that id.",
            )

        now = datetime.now(IST).replace(tzinfo=None)
        document = {
            "_id": str(f"{ObjectId()}-{0}"),
            "patient_id": user["_id"],
            "doctor_id": str(doctor["_id"]),
            "status": "scheduled",
            "chief_complaint": payload.chief_complaint.strip(),
            "appointment_date": starts_at.replace(hour=0, minute=0, second=0, microsecond=0),
            "start_time": starts_at,
            "end_time": starts_at + timedelta(minutes=SLOT_MINUTES),
            "discussion": "",
            "discussion_summary": "",
            "reports": [],
            "tests": [],
            "generated_diagnosis": None,
            "doctor_diagnosis": None,
            "created_at": now,
            "updated_at": now,
        }
        await appointment_collection.insert_one(document)
        return {"message": "Appointment booked", "appointment": _public(document)}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error booking appointment: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB is unreachable, so the appointment could not be saved.",
        )


@router.patch("/{appointment_id}/cancel")
async def cancel_own_appointment(appointment_id: str, user=Depends(get_current_user)):
    """Cancel one of the caller's own upcoming visits."""
    if user.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only a patient can cancel their own appointment.",
        )
    try:
        appointment = await appointment_collection.find_one(
            {"_id": appointment_id, "patient_id": user["_id"]}
        )
        if not appointment:
            # 404 rather than 403: a 403 would confirm that an id exists in another
            # patient's record, which is the thing we are protecting.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment not found.",
            )
        if appointment.get("status") not in CANCELLABLE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A {appointment.get('status')} appointment cannot be cancelled.",
            )
        await appointment_collection.update_one(
            {"_id": appointment_id},
            {"$set": {"status": "cancelled", "updated_at": datetime.now(IST).replace(tzinfo=None)}},
        )
        updated = await appointment_collection.find_one({"_id": appointment_id})
        return {"message": "Appointment cancelled", "appointment": _public(updated or {})}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error cancelling appointment: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB is unreachable, so the appointment could not be cancelled.",
        )
