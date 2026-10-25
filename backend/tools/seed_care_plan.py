# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Seed one real care plan for the demo patient.

    cd backend
    python tools/seed_care_plan.py

Why a script: the diet screen with no plan renders the honest empty state, which
is correct but proves nothing on stage. This writes a clinician-authored plan for
`demo.patient@eunocura.dev` (or the first patient in the database) so the screen
shows a real document, and it is idempotent — run it twice and the plan is
replaced, never duplicated.

The body goes through the same validator the PUT route uses, which is the point:
what this seeds is exactly what the API would accept.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone

sys.path.insert(0, ".")

from src import db as dbmod  # noqa: E402
from src.models.care_plan import (  # noqa: E402
    CarePlanValidationError,
    validate_plan_payload,
)

DEMO_PATIENT_EMAIL = "demo.patient@eunocura.dev"
DEMO_DOCTOR_EMAIL = "demo.doctor@eunocura.dev"

PAYLOAD = {
    "diet": [
        {
            "slot": "Early morning",
            "title": "Warm water, no salt",
            "detail": "One glass on waking. Nothing else until breakfast.",
        },
        {
            "slot": "Breakfast",
            "title": "Oats porridge with toned milk",
            "detail": "40 g oats, 200 ml toned milk, a few walnuts. No sugar.",
        },
        {
            "slot": "Mid-morning",
            "title": "One seasonal fruit",
            "detail": "Guava, apple or orange. Skip banana and mango this week.",
        },
        {
            "slot": "Lunch",
            "title": "Dal, half cup rice, two vegetables",
            "detail": "One katori dal, half cup rice, no pickle, no papad.",
        },
        {
            "slot": "Evening",
            "title": "Unsalted buttermilk",
            "detail": "One glass. Tea or coffee at most one cup, without sugar.",
        },
        {
            "slot": "Dinner",
            "title": "Two rotis, paneer or fish, cooked vegetables",
            "detail": "Finish by 20:30. No second helping of rice.",
        },
        {
            "slot": "Avoid",
            "title": "Salt, fried food, packaged snacks",
            "detail": "Under 5 g salt a day. No chips, namkeen or deep-fried items.",
        },
    ],
    "activity": [
        {
            "slot": "Morning",
            "title": "Walk on flat ground",
            "detail": "20 minutes at a pace where you can still talk.",
        },
        {
            "slot": "Evening",
            "title": "Seated breathing exercises",
            "detail": "10 minutes, pursed-lip breathing. Stop if you feel dizzy.",
        },
        {
            "slot": "Daily",
            "title": "Record weight and blood pressure",
            "detail": "Same time each morning, before food. Bring the log to the next visit.",
        },
    ],
    "notes": (
        "Review in 2 weeks with the BP log. "
        "Stop any activity and call the clinic if there is chest pain, "
        "breathlessness at rest, or swelling in the legs."
    ),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def _find_patient() -> dict | None:
    patient = await dbmod.user_collection.find_one(
        {"email": DEMO_PATIENT_EMAIL, "role": "patient"}
    )
    if patient:
        return patient
    return await dbmod.user_collection.find_one({"role": "patient"})


async def _find_doctor() -> str:
    doctor = await dbmod.user_collection.find_one({"email": DEMO_DOCTOR_EMAIL})
    if not doctor:
        doctor = await dbmod.user_collection.find_one({"role": "doctor"})
    return str(doctor["_id"]) if doctor else "seed-script"


async def main() -> int:
    try:
        plan = validate_plan_payload(PAYLOAD)
    except CarePlanValidationError as exc:
        # A seed that cannot pass the route's own guard must not touch Mongo.
        print(f"seed payload rejected: {exc}")
        return 1

    try:
        patient = await _find_patient()
    except Exception as exc:  # noqa: BLE001
        print(f"MongoDB unreachable ({exc.__class__.__name__}): {exc}")
        print("Start a local mongod (mongodb://localhost:27017) or set MONGODB_URI.")
        return 1

    if not patient:
        print("No patient found. Run `python tools/seed_demo.py` first.")
        return 1

    patient_id = str(patient["_id"])
    author_id = await _find_doctor()

    now = _now()
    record = {
        "patient_id": patient_id,
        "diet": plan["diet"],
        "activity": plan["activity"],
        "notes": plan["notes"],
        "author_id": author_id,
        "source": "clinician",
        "updated_at": now,
    }

    collection = dbmod.db.get_collection("care_plans")
    await collection.update_one(
        {"patient_id": patient_id},
        {"$set": record, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    stored = await collection.find_one({"patient_id": patient_id})
    print(f"patient  {patient.get('email', patient_id)}  id={patient_id}")
    print(f"author   {author_id}")
    print(f"plan     {len(plan['diet'])} diet + {len(plan['activity'])} activity items")
    print(f"updated  {stored.get('updated_at') if stored else 'not readable'}")
    print(f"care_plans in db: {await collection.count_documents({})}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - a seed script prints, never traces
        print(f"seed failed ({exc.__class__.__name__}): {exc}")
        raise SystemExit(1)
