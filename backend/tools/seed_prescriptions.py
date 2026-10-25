"""Seed a believable prescription history for the demo accounts.

    cd backend
    python tools/seed_prescriptions.py

Idempotent: every row this script writes carries `_seed: "seed_prescriptions.py"`,
so a second run replaces its own rows and never duplicates them. Rows you created
through the app are left alone.

Why bother: an empty Medications screen is indistinguishable from a broken one.
The demo patient gets a live list (two active, one completed, one stopped) and the
demo doctor gets a panel to prescribe from. The doctor's read path also needs an
appointment on file, so this script creates that link if it is missing.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta

sys.path.insert(0, ".")

from src import db  # noqa: E402

SEED = "seed_prescriptions.py"
COLLECTION = "prescriptions"

DOCTOR_EMAIL = "demo.doctor@eunocura.dev"
PATIENT_EMAIL = "demo.patient@eunocura.dev"

# (medication, dosage, frequency, route, start_days_ago, end_in_days or None, status,
#  instructions, refills_left) — None end date means "ongoing".
ROWS = [
    ("Metformin", "500 mg", "twice daily with meals", "oral", 46, None, "active",
     "Take after breakfast and dinner. Report any new numbness in the feet.", 2),
    ("Telmisartan", "40 mg", "once daily in the morning", "oral", 46, None, "active",
     "Home BP twice a week, log the readings.", 2),
    ("Atorvastatin", "20 mg", "once daily at night", "oral", 140, -94, "completed",
     "Repeat lipid profile after the course.", 0),
    ("Amoxicillin + Clavulanate", "625 mg", "three times daily", "oral", 16, -9, "completed",
     "Complete all seven days even if the fever settles.", 0),
    ("Salbutamol inhaler", "100 mcg", "two puffs when breathless", "inhalation", 380, -350, "stopped",
     "Stopped after the wheeze resolved. Bring the inhaler to the next visit.", 0),
]


async def _find_user(email: str, role: str) -> dict:
    user = await db.user_collection.find_one({"email": email})
    if user is None:
        user = await db.user_collection.find_one({"role": role})
    if user is None:
        raise SystemExit(
            f"No {role} account found. Run `python tools/seed_demo.py` first "
            f"(expected {email})."
        )
    return user


async def _ensure_appointment(doctor_id: str, patient_id: str) -> None:
    """The doctor read path is gated on an existing appointment; create the link once."""
    appointments = db.db.get_collection("appointments")
    existing = await appointments.find_one({"doctor_id": doctor_id, "patient_id": patient_id}, {"_id": 1})
    if existing:
        print(f"appointment already links the demo pair: {existing['_id']}")
        return
    now = datetime.now()
    document = {
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "status": "scheduled",
        "chief_complaint": "Follow-up for blood pressure and diabetes review.",
        "appointment_date": now,
        "start_time": now,
        "end_time": None,
        "discussion": "Follow-up for blood pressure and diabetes review.",
        "discussion_summary": "",
        "reports": [],
        "tests": [],
        "generated_diagnosis": None,
        "doctor_diagnosis": None,
        "created_at": now,
        "updated_at": now + timedelta(seconds=0),
    }
    result = await appointments.insert_one(document)
    print(f"appointment created: {result.inserted_id}")


async def main() -> None:
    doctor = await _find_user(DOCTOR_EMAIL, "doctor")
    patient = await _find_user(PATIENT_EMAIL, "patient")
    doctor_id = str(doctor["_id"])
    patient_id = str(patient["_id"])
    doctor_name = doctor.get("full_name") or doctor.get("name") or "Demo Doctor"

    print(f"doctor  id={doctor_id}  {doctor_name}")
    print(f"patient id={patient_id}  {patient.get('full_name') or patient.get('name')}")

    collection = db.db.get_collection(COLLECTION)
    # `_seed` is internal: the serialiser drops underscore keys, so it never
    # reaches the browser. Plain `seed` is also cleaned up for older rows.
    removed = await collection.delete_many({"$or": [{"_seed": SEED}, {"seed": SEED}]})
    print(f"previous seed rows removed: {removed.deleted_count}")

    today = datetime.now().date()
    documents = []
    for medication, dosage, frequency, route, start_days_ago, end_in_days, status, instructions, refills in ROWS:
        start = today - timedelta(days=start_days_ago)
        documents.append({
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "doctor_name": doctor_name,
            "medication": medication,
            "dosage": dosage,
            "frequency": frequency,
            "route": route,
            "start_date": start.isoformat(),
            "end_date": None if end_in_days is None else (today + timedelta(days=end_in_days)).isoformat(),
            "status": status,
            "instructions": instructions,
            "refills_left": refills,
            # created_at is the sort key; anchoring it to the start date keeps the
            # list stable no matter when the seed runs.
            "created_at": f"{start.isoformat()}T09:15:00+00:00",
            "updated_at": f"{start.isoformat()}T09:15:00+00:00",
            "_seed": SEED,
        })

    documents.sort(key=lambda doc: doc["created_at"], reverse=True)
    result = await collection.insert_many(documents)
    print(f"inserted {len(result.inserted_ids)} prescriptions")

    for doc in documents:
        print(f"  {doc['status']:<9} {doc['medication']:<26} {doc['start_date']}"
              f" -> {doc['end_date'] or 'ongoing'}")

    await _ensure_appointment(doctor_id, patient_id)
    print(f"\nprescriptions in db: {await collection.count_documents({})}")
    print(f"doctor read check: GET /prescriptions/patient/{patient_id}")


asyncio.run(main())
