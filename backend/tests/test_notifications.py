# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Tests for notifications. Offline record shape first, then a live smoke run.

    cd backend
    python tests/test_notifications.py

The first half needs no database, no network and no key: `build_record` and
`_serialise` are pure, and the contract (`id`, never `_id`) is exactly the kind
of thing that breaks silently. The second half talks to a local mongod and is
skipped, loudly, when there is not one.
"""

from __future__ import annotations

import pathlib
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bson import ObjectId  # noqa: E402

from src.config import ALGORITHM, SECRET_KEY  # noqa: E402
from src.models.notification import (  # noqa: E402
    CATEGORIES,
    FIELDS,
    _serialise,
    build_record,
)
from src.routes.notification import _unavailable  # noqa: E402

failures: list[str] = []
checks = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global checks
    checks += 1
    if ok:
        print(f"  ok    {name}")
    else:
        print(f"  FAIL  {name}  {detail}")
        failures.append(name)


NID = ObjectId("64b7f0c2a1d3e4f5a6b7c8d9")
PATIENT_ID = "64b7f0c2a1d3e4f5a6b7c8aa"


# ---------------------------------------------------------------- record shape

print("\nnotifications — record shape (offline)\n")

record = build_record(
    user_id=PATIENT_ID,
    title="  Take metformin with food  ",
    body="  After breakfast, 500 mg.  ",
    category="medication",
    link="/medications",
)
check("build_record stores the six contract fields", set(record) == set(FIELDS[1:]),
      str(sorted(record)))
check("title and body are trimmed", record["title"] == "Take metformin with food"
      and record["body"] == "After breakfast, 500 mg.")
check("a new notification is unread", record["read"] is False)
check("created_at is an ISO-8601 UTC string",
      record["created_at"].endswith("+00:00") and "T" in record["created_at"],
      record["created_at"])
check("link survives", record["link"] == "/medications")

check("an empty link becomes null, not ''",
      build_record(user_id=PATIENT_ID, title="x")["link"] is None)

defaulted = build_record(user_id=PATIENT_ID, title="system note")
check("category defaults to system", defaulted["category"] == "system")
check("all four categories are accepted",
      all(build_record(user_id=PATIENT_ID, title="x", category=c)["category"] == c
          for c in CATEGORIES))

for bad in ("alert", "", "MEDICATION"):
    try:
        build_record(user_id=PATIENT_ID, title="x", category=bad)
        check(f"unknown category {bad!r} is refused", False)
    except ValueError:
        check(f"unknown category {bad!r} is refused", True)

try:
    build_record(user_id="   ", title="x")
    check("a record with no recipient is refused", False)
except ValueError:
    check("a record with no recipient is refused", True)


# ---------------------------------------------------------------- serialising

doc = {
    "_id": NID,
    "user_id": PATIENT_ID,
    "title": "Repeat TSH in 6 weeks",
    "body": "",
    "category": "result",
    "read": 1,
    "created_at": datetime(2026, 10, 24, 9, 30, tzinfo=timezone.utc),
    "link": None,
    # Not part of the contract. A seed script may add it; the browser must not see it.
    "seed_key": "internal-only",
}
out = _serialise(doc)
check("_id is serialised to id and never leaked",
      out["id"] == str(NID) and "_id" not in out, str(out.get("id")))
check("the payload has exactly the contract keys",
      list(out) == list(FIELDS), str(list(out)))
check("extra document fields are dropped", "seed_key" not in out)
check("a naive datetime becomes ISO-8601 UTC",
      _serialise({**doc, "created_at": datetime(2026, 10, 24, 9, 30)})["created_at"]
      == "2026-10-24T09:30:00+00:00")
check("read 1 becomes a real bool", out["read"] is True)
check("an ISO string passes through unharmed",
      _serialise({**doc, "created_at": "2026-10-24T09:30:00+00:00"})["created_at"]
      == "2026-10-24T09:30:00+00:00")
check("a missing link is null", out["link"] is None)
check("a row with no _id still serialises",
      _serialise({"user_id": PATIENT_ID, "title": "x"})["id"] == "")
check("an unknown stored category degrades to system",
      _serialise({**doc, "category": "mystery"})["category"] == "system")


# ---------------------------------------------------------------- degrade path

print("\nnotifications — storage failure\n")

unavailable = _unavailable(RuntimeError("connection refused"))
check("a dead Mongo is a 503, never a 500", unavailable.status_code == 503)
check("the 503 body names the fix",
      "MONGODB_URI" in unavailable.detail and "mongod" in unavailable.detail,
      unavailable.detail)


# ---------------------------------------------------------------- live smoke

print("\nnotifications — live smoke (local mongod)\n")


def mongo_up() -> bool:
    try:
        from pymongo import MongoClient

        client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=1200)
        client.admin.command("ping")
        client.close()
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  skip  mongod not reachable ({exc.__class__.__name__})")
        return False


if not mongo_up():
    print("\n  live smoke skipped — mongod is not running on 127.0.0.1:27017")
else:
    import jwt
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from pymongo import MongoClient

    from src.routes.notification import router

    tag = uuid.uuid4().hex[:8]
    sync_client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=1500)
    sync_db = sync_client["InterIIIT"]
    users = sync_db["users"]
    notifications = sync_db["notifications"]

    email_patient = f"test.notif.{tag}.patient@eunocura.test"
    email_other = f"test.notif.{tag}.other@eunocura.test"
    email_doctor = f"test.notif.{tag}.doctor@eunocura.test"

    # Same shape auth.py reads: a role on a users document plus a JWT claim.
    patient = users.insert_one(
        {"email": email_patient, "full_name": "Test Patient", "role": "patient"}
    ).inserted_id
    other = users.insert_one(
        {"email": email_other, "full_name": "Other Patient", "role": "patient"}
    ).inserted_id
    doctor = users.insert_one(
        {"email": email_doctor, "full_name": "Test Doctor", "role": "doctor"}
    ).inserted_id
    patient_id, other_id, doctor_id = str(patient), str(other), str(doctor)

    def token(user_id: str, role: str) -> str:
        return jwt.encode(
            {"user_id": user_id, "user_type": role}, SECRET_KEY, algorithm=ALGORITHM or "HS256"
        )

    def auth(user_id: str, role: str) -> dict:
        return {"Authorization": f"Bearer {token(user_id, role)}"}

    # Test the router as the orchestrator will mount it, so this file does not
    # depend on root.py having been wired yet.
    app = FastAPI()
    app.include_router(router, prefix="/notifications")

    try:
        with TestClient(app) as client:
            r = client.get("/notifications/me")
            check("no token is 401", r.status_code == 401, str(r.status_code))

            r = client.get("/notifications/me", headers=auth(patient_id, "patient"))
            check("a new inbox is empty",
                  r.status_code == 200 and r.json() == {"items": [], "unread": 0},
                  r.text[:200])

            r = client.post(
                "/notifications/",
                headers=auth(patient_id, "patient"),
                json={"title": "patients cannot do this"},
            )
            check("a patient cannot create notifications", r.status_code == 403,
                  str(r.status_code))

            r = client.post(
                "/notifications/",
                headers=auth(doctor_id, "doctor"),
                json={
                    "user_id": patient_id,
                    "title": "Take metformin with breakfast",
                    "body": "500 mg after food for 30 days.",
                    "category": "medication",
                    "link": "/medications",
                },
            )
            created = r.json()
            check("a doctor can notify a patient", r.status_code == 201, r.text[:200])
            check("the response is the contract record",
                  list(created) == list(FIELDS), str(list(created)))
            check("the record names the patient",
                  created.get("user_id") == patient_id, str(created.get("user_id")))
            check("_id is never returned", "_id" not in created)
            first_id = created.get("id", "")

            r = client.post(
                "/notifications/",
                headers=auth(doctor_id, "doctor"),
                json={"title": "Your results are ready", "category": "result"},
            )
            check("a doctor can notify themselves",
                  r.status_code == 201 and r.json()["user_id"] == doctor_id,
                  r.text[:200])

            r = client.post(
                "/notifications/",
                headers=auth(doctor_id, "doctor"),
                json={"title": "unknown", "user_id": ObjectId().__str__()},
            )
            check("a notification for an unknown user is refused",
                  r.status_code == 404, str(r.status_code))

            r = client.post(
                "/notifications/",
                headers=auth(doctor_id, "doctor"),
                json={"title": "x", "user_id": patient_id, "category": "alert"},
            )
            check("an unknown category is a 422", r.status_code == 422,
                  str(r.status_code))

            r = client.get("/notifications/me", headers=auth(patient_id, "patient"))
            body = r.json()
            check("the patient sees exactly their own row",
                  len(body["items"]) == 1 and body["items"][0]["id"] == first_id,
                  str(body)[:200])
            check("the unread badge counts it", body["unread"] == 1, str(body["unread"]))

            r = client.get("/notifications/me", headers=auth(doctor_id, "doctor"))
            check("the doctor's own inbox is separate",
                  len(r.json()["items"]) == 1 and r.json()["items"][0]["user_id"] == doctor_id,
                  r.text[:200])

            r = client.post(f"/notifications/{first_id}/read",
                            headers=auth(patient_id, "patient"))
            check("marking a row read works",
                  r.status_code == 200 and r.json()["read"] is True, r.text[:200])

            r = client.get("/notifications/me", headers=auth(patient_id, "patient"))
            check("the badge drops to zero", r.json()["unread"] == 0,
                  str(r.json()["unread"]))

            r = client.post(f"/notifications/{first_id}/read",
                            headers=auth(other_id, "patient"))
            check("someone else's row is a 404, not a 403", r.status_code == 404,
                  str(r.status_code))

            r = client.delete(f"/notifications/{first_id}",
                              headers=auth(other_id, "patient"))
            check("someone else's row cannot be deleted", r.status_code == 404,
                  str(r.status_code))

            r = client.get("/notifications/me", headers=auth(other_id, "patient"))
            check("a stranger's inbox is untouched",
                  r.json() == {"items": [], "unread": 0}, r.text[:200])

            r = client.post(
                "/notifications/",
                headers=auth(doctor_id, "doctor"),
                json={"user_id": patient_id, "title": "Appointment moved to 4 pm",
                      "body": "Same doctor, same room.", "category": "appointment"},
            )
            second_id = r.json()["id"]

            r = client.post("/notifications/read-all", headers=auth(patient_id, "patient"))
            check("read-all marks the unread rows",
                  r.status_code == 200 and r.json()["updated"] == 1, r.text[:200])

            r = client.get("/notifications/me", headers=auth(patient_id, "patient"))
            check("both rows are now read",
                  r.json()["unread"] == 0 and len(r.json()["items"]) == 2, r.text[:200])

            r = client.get("/notifications/me?limit=1", headers=auth(patient_id, "patient"))
            check("limit caps the page but not the badge",
                  len(r.json()["items"]) == 1 and r.json()["unread"] == 0, r.text[:200])
            check("newest first",
                  r.json()["items"][0]["id"] == second_id, r.text[:200])

            r = client.delete(f"/notifications/{second_id}",
                              headers=auth(patient_id, "patient"))
            check("own row is deleted",
                  r.status_code == 200 and r.json()["deleted"] is True, r.text[:200])

            r = client.delete(f"/notifications/{second_id}",
                              headers=auth(patient_id, "patient"))
            check("deleting it twice is a 404", r.status_code == 404, str(r.status_code))

            r = client.post("/notifications/not-an-object-id/read",
                            headers=auth(patient_id, "patient"))
            check("a junk id is a 404, not a crash", r.status_code == 404,
                  str(r.status_code))

            # The 503 rule, exercised for real: swap the collection for one that
            # raises the way pymongo does when mongod is gone.
            from src.routes import notification as notification_route

            original = notification_route._collection

            def dead_collection():
                class Dead:
                    def find(self, *args, **kwargs):
                        raise RuntimeError("connection refused")

                    async def count_documents(self, *args, **kwargs):
                        raise RuntimeError("connection refused")

                return Dead()

            notification_route._collection = dead_collection
            try:
                r = client.get("/notifications/me", headers=auth(patient_id, "patient"))
                check("a dead collection is a 503, not a 500", r.status_code == 503,
                      str(r.status_code))
                check("the 503 names the fix",
                      "MONGODB_URI" in r.json().get("detail", ""), r.text[:200])
            finally:
                notification_route._collection = original
    finally:
        notifications.delete_many({"user_id": {"$in": [patient_id, other_id, doctor_id]}})
        users.delete_many({"_id": {"$in": [patient, other, doctor]}})
        sync_client.close()


# ---------------------------------------------------------------- result

print(f"\n  {checks - len(failures)}/{checks} passed\n")
if failures:
    print("  failed: " + ", ".join(failures) + "\n")
    sys.exit(1)
print("  PASS  notifications answer with the frozen record shape\n")
