"""Seed the two accounts the demo logs in with, plus one appointment to open.

    cd backend
    python tools/seed_demo.py

Why a script and not clicking through signup at the venue: the password on the
existing demo accounts is unknown, an empty doctor dashboard has nothing to
click, and a demo that depends on remembering which password you typed at 14:40
is a demo that fails at 17:20. This is idempotent — run it twice and nothing
duplicates.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta

sys.path.insert(0, ".")

from src.config import password_hash  # noqa: E402
from src.db import db, user_collection  # noqa: E402

PASSWORD = "Demo@2026"

DOCTOR = {
    "email": "demo.doctor@eunocura.dev",
    "full_name": "Demo Doctor",
    "role": "doctor",
    "phone": "9999999999",
    "specialization": "Internal Medicine",
    "license_number": "DEMO-KA-0001",
    "hospital": "EUNOCURA General Hospital",
    "years_of_experience": 12,
}

PATIENT = {
    "email": "demo.patient@eunocura.dev",
    "full_name": "Asha Rao",
    "role": "patient",
    "phone": "9999999998",
    "gender": "female",
    "date_of_birth": datetime(1972, 3, 14),
    "blood_group": "B+",
    "address": "Bengaluru, Karnataka",
}

COMPLAINT = "Fever with cough and breathlessness for four days, SpO2 91% on room air."


async def upsert_user(payload: dict) -> dict:
    existing = await user_collection.find_one({"email": payload["email"]})
    document = dict(payload)
    document["hashed_password"] = password_hash.hash(PASSWORD)
    document["password"] = PASSWORD  # upstream stores the plaintext too; keep shape
    if existing:
        await user_collection.update_one({"_id": existing["_id"]}, {"$set": document})
        document["_id"] = existing["_id"]
    else:
        result = await user_collection.insert_one(document)
        document["_id"] = result.inserted_id
    return document


async def main() -> None:
    doctor = await upsert_user(DOCTOR)
    patient = await upsert_user(PATIENT)
    print(f"doctor  {doctor['email']:<28} id={doctor['_id']}")
    print(f"patient {patient['email']:<28} id={patient['_id']}")

    appointment = await db.appointments.find_one(
        {"patient_id": str(patient["_id"]), "doctor_id": str(doctor["_id"])}
    )
    if appointment:
        print(f"appointment already there: {appointment['_id']} ({appointment.get('status')})")
    else:
        now = datetime.now()
        document = {
            "patient_id": str(patient["_id"]),
            "doctor_id": str(doctor["_id"]),
            "status": "scheduled",
            "chief_complaint": COMPLAINT,
            "appointment_date": now,
            "start_time": now,
            "end_time": None,
            "discussion": COMPLAINT,
            "discussion_summary": "",
            "reports": [],
            "tests": [],
            "generated_diagnosis": None,
            "doctor_diagnosis": None,
            "created_at": now,
            "updated_at": now + timedelta(seconds=0),
        }
        result = await db.appointments.insert_one(document)
        print(f"appointment created: {result.inserted_id}")

    print(f"\nlogin: {DOCTOR['email']} / {PASSWORD}")
    print(f"       {PATIENT['email']} / {PASSWORD}")
    print(f"appointments in db: {await db.appointments.count_documents({})}")


asyncio.run(main())
