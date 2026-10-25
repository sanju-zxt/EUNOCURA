"""Seed lab results for the demo patient, so the trend charts have real history.

    cd backend
    python tools/seed_lab_results.py
    python tools/seed_lab_results.py --email demo.patient@eunocura.dev
    python tools/seed_lab_results.py --patient-id 64b7f0c2a1b2c3d4e5f60718

Why: the clinician and patient screens both read `/lab-results/me`, and a chart
with one point is a fixture with extra steps. Four series, twelve points, values
plausible for a 54-year-old woman with type 2 diabetes and resolving pneumonia.

Idempotent: each point is upserted on `(patient_id, test_name, taken_at)`, so
running it twice leaves twelve documents, not twenty-four. `status` is computed
by the same rule the API uses - never typed in by hand.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime

sys.path.insert(0, ".")

from src import db as dbmod  # noqa: E402
from src.models.lab_result import derive_status  # noqa: E402

COLLECTION = "lab_results"

DEMO_EMAIL = "demo.patient@eunocura.dev"

MONGO_HINT = (
    "MongoDB is not reachable. Start a local mongod (mongodb://localhost:27017) "
    "or set MONGODB_URI in backend/.env, then run this again."
)

# (test_name, unit, reference_low, reference_high, [(taken_at, value, note)])
SERIES = [
    (
        "HbA1c", "%", 4.0, 5.7,
        [
            (datetime(2026, 4, 12, 9, 15), 8.4, "Baseline at first visit"),
            (datetime(2026, 7, 10, 9, 40), 7.6, "Metformin 1 g twice daily"),
            (datetime(2026, 10, 2, 10, 5), 7.1, "Improving; continue current dose"),
        ],
    ),
    (
        "Fasting glucose", "mg/dL", 70.0, 99.0,
        [
            (datetime(2026, 4, 12, 8, 50), 168.0, ""),
            (datetime(2026, 7, 10, 8, 55), 141.0, ""),
            (datetime(2026, 8, 21, 9, 10), 118.0, ""),
            (datetime(2026, 10, 2, 9, 35), 104.0, "Still above range"),
        ],
    ),
    (
        "Serum creatinine", "mg/dL", 0.6, 1.2,
        [
            (datetime(2026, 4, 12, 9, 20), 1.1, ""),
            (datetime(2026, 7, 10, 9, 45), 1.3, "Repeat in three months"),
            (datetime(2026, 10, 2, 10, 10), 1.0, "Back inside range"),
        ],
    ),
    (
        "Haemoglobin", "g/dL", 12.0, 15.5,
        [
            (datetime(2026, 4, 12, 9, 25), 10.2, "Anaemia of chronic disease"),
            (datetime(2026, 10, 2, 10, 15), 12.6, "Normal after treatment"),
        ],
    ),
]


def _not_found_hint() -> str:
    return (
        "No patient found. Run `python tools/seed_demo.py` first, or pass "
        "`--patient-id <id>` / `--email <address>`."
    )


async def find_patient(patient_id: str | None, email: str | None) -> dict:
    users = dbmod.db.get_collection("users")
    if patient_id:
        query: dict = {"_id": patient_id}
        try:
            from bson import ObjectId

            query = {"_id": ObjectId(patient_id)}
        except Exception:  # noqa: BLE001 - a non-ObjectId demo id is legal here
            pass
        patient = await users.find_one(query)
    elif email:
        patient = await users.find_one({"email": email})
    else:
        patient = await users.find_one({"email": DEMO_EMAIL}) or await users.find_one({"role": "patient"})

    if not patient:
        raise SystemExit(f"{_not_found_hint()}\n")
    return patient


async def seed(patient_id: str) -> int:
    collection = dbmod.db.get_collection(COLLECTION)
    written = 0

    for test_name, unit, low, high, points in SERIES:
        for taken_at, value, note in points:
            document = {
                "patient_id": patient_id,
                "test_name": test_name,
                "value": float(value),
                "unit": unit,
                "reference_low": low,
                "reference_high": high,
                "status": derive_status(value, low, high),
                "taken_at": taken_at,
                "source": "manual",
                "note": note or None,
                "created_at": datetime(2026, 10, 24, 18, 0),
            }
            await collection.update_one(
                {"patient_id": patient_id, "test_name": test_name, "taken_at": taken_at},
                {"$set": document},
                upsert=True,
            )
            written += 1
            print(
                f"  {test_name:<18} {taken_at:%Y-%m-%d}  "
                f"{value:>7} {unit:<6} [{low}, {high}] -> {document['status']}"
            )

    total = await collection.count_documents({"patient_id": patient_id})
    print(f"\n  {written} points written, {total} now stored for patient {patient_id}\n")
    return total


async def main() -> int:
    parser = argparse.ArgumentParser(description="Seed demo lab results.")
    parser.add_argument("--patient-id", default=None, help="patient document id")
    parser.add_argument("--email", default=None, help="patient email (default: demo patient)")
    args = parser.parse_args()

    if getattr(dbmod, "db", None) is None or not await dbmod.ping():
        print(f"\n  {MONGO_HINT}\n")
        return 1

    patient = await find_patient(args.patient_id, args.email)
    print(f"\n  patient: {patient.get('full_name', '?')} <{patient.get('email', '?')}>\n")
    await seed(str(patient["_id"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
