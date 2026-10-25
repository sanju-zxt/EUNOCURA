# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Seed a believable notification inbox for the demo patient.

    cd backend
    python tools/seed_notifications.py

Why: an empty inbox is a dead screen in a demo, and hand-created rows in Compass
are the usual way a demo turns into "let me fix that quickly". Idempotent — each
row carries a `seed_key`, so running this twice changes nothing. The extra key is
dropped before the JSON leaves the API (`_serialise` keeps only the contract).
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from src.db import db, user_collection  # noqa: E402
from src.models.notification import build_record  # noqa: E402

PATIENT_EMAIL = "demo.patient@eunocura.dev"
COLLECTION = "notifications"

# (seed_key, hours_ago, read, category, title, body, link)
SEED_ROWS = [
    (
        "med-refill",
        2,
        False,
        "medication",
        "Take metformin with breakfast",
        "500 mg after food for the next 30 days.",
        "/medications",
    ),
    (
        "result-hba1c",
        20,
        False,
        "result",
        "Your HbA1c result is back",
        "8.4 % — above the 5.7 % reference. Dr Meera has reviewed it.",
        "/test-results",
    ),
    (
        "appt-followup",
        52,
        True,
        "appointment",
        "Follow-up booked for Monday, 10:30",
        "OPD block B, room 14. Bring the discharge summary.",
        "/appointments",
    ),
    (
        "sys-welcome",
        120,
        True,
        "system",
        "Welcome to EUNOCURA",
        "Every answer here cites a line in your own documents. Nothing is invented.",
        None,
    ),
]


def _ago(hours: int) -> str:
    moment = datetime.now(timezone.utc) - timedelta(hours=hours)
    return moment.isoformat(timespec="seconds")


async def main() -> None:
    patient = await user_collection.find_one({"email": PATIENT_EMAIL})
    if patient is None:
        patient = await user_collection.find_one({"role": "patient"})
    if patient is None:
        print(f"no patient account found. Run tools/seed_demo.py first "
              f"(looked for {PATIENT_EMAIL}).")
        sys.exit(1)

    patient_id = str(patient["_id"])
    collection = db.get_collection(COLLECTION)
    created = 0

    for key, hours, read, category, title, body, link in SEED_ROWS:
        record = build_record(
            user_id=patient_id,
            title=title,
            body=body,
            category=category,
            link=link,
            read=read,
            created_at=_ago(hours),
        )
        record["seed_key"] = key
        result = await collection.update_one(
            {"user_id": patient_id, "seed_key": key},
            {"$setOnInsert": record},
            upsert=True,
        )
        created += int(result.upserted_id is not None)

    total = await collection.count_documents({"user_id": patient_id})
    unread = await collection.count_documents({"user_id": patient_id, "read": False})
    print(f"patient {patient.get('email') or patient_id}  id={patient_id}")
    print(f"created {created} new row(s); inbox now {total} row(s), {unread} unread")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:  # noqa: BLE001 - a missing mongod gets the fix, not a traceback
        print(f"MongoDB is unreachable ({exc.__class__.__name__}: {exc}).")
        print("Start it (mongod --dbpath <dir>) or set MONGODB_URI in backend/.env.")
        sys.exit(1)
