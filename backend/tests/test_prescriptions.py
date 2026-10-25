# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Tests for the prescriptions feature.

    cd backend
    python tests/test_prescriptions.py

The rules that matter (status enum, date shapes, ObjectId safety, "a client cannot
name the doctor") are pure functions, so they are checked here with no database at
all. The round-trip block at the end runs only when a local mongod answers; without
one it prints a skip line and the suite still passes. Nothing here needs a model,
a network, or a JWT.
"""

from __future__ import annotations

import asyncio
import json
import pathlib
import sys
from datetime import date, datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bson import ObjectId  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.models.prescription import (  # noqa: E402
    DEFAULT_STATUS,
    STATUSES,
    PrescriptionCreate,
    PrescriptionUpdate,
    build_document,
    id_query,
    parse_date,
    to_object_id,
    to_public,
    validate_status,
)
from src.routes.prescription import router  # noqa: E402

failures: list[str] = []
checks = 0
skips = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global checks
    checks += 1
    if ok:
        print(f"  ok    {name}")
    else:
        print(f"  FAIL  {name}  {detail}")
        failures.append(name)


def skip(name: str, reason: str) -> None:
    global skips
    skips += 1
    print(f"  skip  {name}  ({reason})")


def raises(fn, *args, **kwargs):
    """Return the exception a call raises, or None. Keeps the asserts one-liners."""
    try:
        fn(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001 - the type is what we assert on
        return exc
    return None


# ---------------------------------------------------------------- status enum

print("\nprescriptions\n")

check("the enum is exactly the three contract values", STATUSES == ("active", "completed", "stopped"), str(STATUSES))
check("default status is active", DEFAULT_STATUS == "active")

check("a valid status passes through", validate_status("active") == "active")
check("case and padding are normalised", validate_status("  Stopped ") == "stopped")
check("'completed' is accepted", validate_status("COMPLETED") == "completed")
check("an unknown status is rejected", isinstance(raises(validate_status, "paused"), ValueError))
check("an empty status is rejected", isinstance(raises(validate_status, ""), ValueError))
check("a missing status is rejected", isinstance(raises(validate_status, None), ValueError))
check("the error names the allowed values", "active, completed, stopped" in str(raises(validate_status, "x")))

# ---------------------------------------------------------------- dates


check("a plain date string survives", parse_date("2026-10-01") == "2026-10-01")
check("a datetime is cut to its calendar day", parse_date("2026-10-01T23:30:00+05:30") == "2026-10-01")
check("a python date is accepted", parse_date(date(2026, 1, 5)) == "2026-01-05")
check("a python datetime is accepted",
      parse_date(datetime(2026, 1, 5, 18, 0, tzinfo=timezone.utc)) == "2026-01-05")
check("a slash format is rejected", isinstance(raises(parse_date, "01/10/2026"), ValueError))
check("a non-date is rejected", isinstance(raises(parse_date, "next tuesday"), ValueError))
check("None is allowed only when asked for", parse_date(None, allow_none=True) is None
      and isinstance(raises(parse_date, None), ValueError))
check("a blank string clears an optional date", parse_date("  ", allow_none=True) is None)

# ---------------------------------------------------------------- ObjectId safety

oid = ObjectId()
doc = {
    "_id": oid,
    "patient_id": "665f00000000000000000001",
    "created_at": datetime(2026, 10, 1, 9, 30, tzinfo=timezone.utc),
    "start_date": "2026-10-01",
    "status": "active",
}
public = to_public(doc)

check("_id never leaks", "_id" not in public)
check("_id becomes a string id", public["id"] == str(oid))
check("the input document is not mutated", isinstance(doc["_id"], ObjectId) and doc["_id"] == oid)
check("datetimes become ISO strings", public["created_at"] == "2026-10-01T09:30:00+00:00", public["created_at"])
check("the payload is JSON-serialisable", json.dumps(public) != "")
check("a document with no _id still has an id", to_public({"status": "active"})["id"] == "")
check("plain fields are untouched", public["start_date"] == "2026-10-01" and public["status"] == "active")
check("internal underscore keys are not serialised", to_public({"_id": oid, "_seed": "x"}) == {"id": str(oid)})

check("an ObjectId reference is parsed", isinstance(to_object_id(str(oid)), ObjectId))
check("a non-id string is not parsed", to_object_id("abc") is None)
check("a 24-char non-hex string is not parsed", to_object_id("z" * 24) is None)
check("an ObjectId passes straight through", to_object_id(oid) == oid)

query = id_query(str(oid))
check("an id query matches ObjectId and string shapes", query["_id"]["$in"][0] == oid and query["_id"]["$in"][1] == str(oid))
check("a short id falls back to the raw string", id_query("abc")["_id"]["$in"] == ["abc"])

# ---------------------------------------------------------------- create body

payload = PrescriptionCreate(
    patient_id="665f00000000000000000001",
    medication="Metformin",
    dosage="500 mg",
    frequency="twice daily",
    start_date="2026-10-01",
)
built = build_document(payload, doctor_id=str(oid), doctor_name="Dr Asha Rao")

check("doctor id comes from the caller", built["doctor_id"] == str(oid))
check("doctor name is stored for display", built["doctor_name"] == "Dr Asha Rao")
check("status defaults to active", built["status"] == "active")
check("an absent end_date is stored as null", built["end_date"] is None)
check("created and updated agree", built["created_at"] == built["updated_at"])
check("timestamps are ISO strings", "T" in built["created_at"] and built["created_at"].endswith("+00:00"))
check("instructions default to empty", built["instructions"] == "")
check("refills default to zero", built["refills_left"] == 0)
check("route defaults to oral", built["route"] == "oral")
check("whitespace is trimmed", build_document(
    payload.model_copy(update={"medication": "  Metformin  "}), doctor_id="d", doctor_name=""
)["medication"] == "Metformin")

check("a client cannot name the doctor", build_document(
    PrescriptionCreate(**{**payload.model_dump(), "doctor_id": "attacker", "created_at": "1999-01-01"}),
    doctor_id=str(oid), doctor_name="Dr Asha Rao",
)["doctor_id"] == str(oid))

check("a client cannot forge a status", isinstance(
    raises(build_document, payload.model_copy(update={"status": "cured"}), doctor_id="d", doctor_name=""), ValueError))

check("end before start is rejected", isinstance(
    raises(build_document, payload.model_copy(update={"end_date": "2026-09-01"}), doctor_id="d", doctor_name=""),
    ValueError,
))

no_start = build_document(payload.model_copy(update={"start_date": None}), doctor_id="d", doctor_name="")
check("a missing start_date becomes today", no_start["start_date"] == date.today().isoformat(), no_start["start_date"])

check("a blank medication is refused by the model", isinstance(
    raises(PrescriptionCreate, patient_id="p", medication="", dosage="1", frequency="x"), Exception))
check("a negative refill count is refused", isinstance(
    raises(PrescriptionCreate, patient_id="p", medication="m", dosage="1", frequency="x", refills_left=-1), Exception))

# ---------------------------------------------------------------- patch body


check("an empty patch says nothing to change", PrescriptionUpdate().changes() == {})

patched = PrescriptionUpdate(status="Completed", dosage=" 1000 mg ").changes()
check("a patch validates its status", patched["status"] == "completed")
check("a patch trims text", patched["dosage"] == "1000 mg")
check("a patch does not invent keys", set(patched) == {"status", "dosage"}, str(set(patched)))
check("an unknown patch status is rejected", isinstance(raises(PrescriptionUpdate(status="better").changes), ValueError))
check("a blank dosage is rejected", isinstance(raises(PrescriptionUpdate(dosage="   ").changes), ValueError))
check("a blank note is allowed", PrescriptionUpdate(instructions="").changes() == {"instructions": ""})
check("an omitted end_date leaves the field alone", "end_date" not in PrescriptionUpdate(status="stopped").changes())
check("an explicit null end_date clears it", "end_date" in PrescriptionUpdate(end_date=None).changes()
      and PrescriptionUpdate(end_date=None).changes()["end_date"] is None)
check("a bad patch date is rejected", isinstance(raises(PrescriptionUpdate(end_date="31-12-2026").changes), ValueError))
check("refills update as an int", PrescriptionUpdate(refills_left=2).changes() == {"refills_left": 2})

# ---------------------------------------------------------------- routes, no database

mini = FastAPI()
mini.include_router(router, prefix="/prescriptions", tags=["prescriptions"])
client = TestClient(mini)

paths = sorted(route.path for route in router.routes)
check("four routes are declared", len(paths) == 4, str(paths))
check("the list route is /me", "/me" in paths, str(paths))
check("the doctor route is /patient/{patient_id}", "/patient/{patient_id}" in paths, str(paths))
check("the patch route takes an id", "/{prescription_id}" in paths, str(paths))

check("no token is a 401 on /me", client.get("/prescriptions/me").status_code == 401)
check("no token is a 401 on the doctor route", client.get("/prescriptions/patient/abc").status_code == 401)
check("no token is a 401 on create", client.post("/prescriptions/", json={}).status_code == 401)
check("no token is a 401 on patch", client.patch("/prescriptions/abc", json={"status": "active"}).status_code == 401)
check("the prefix reaches the app", "/prescriptions/me" in mini.openapi().get("paths", {}),
      str(sorted(mini.openapi().get("paths", {}))))


# ---------------------------------------------------------------- round trip (needs mongod)


async def round_trip() -> str | None:
    """Exercise the real collection. Returns a skip reason, or None when it ran."""
    from src import db as dbmod
    from src.models.prescription import PrescriptionCreate as Create
    from src.models.prescription import PrescriptionUpdate as Update
    from src.routes.prescription import (
        COLLECTION,
        create_prescription,
        my_prescriptions,
        patient_prescriptions,
        update_prescription,
    )

    if not await dbmod.ping(800):
        return "MongoDB is not answering on 127.0.0.1:27017"

    patient = await dbmod.db.get_collection("users").find_one({"role": "patient"}, {"_id": 1})
    if patient is None:
        return "no patient account in the database (run tools/seed_demo.py)"

    patient_id = str(patient["_id"])
    doctor = {"_id": str(ObjectId()), "role": "doctor", "full_name": "Dr Test Case"}
    patient_user = {"_id": patient_id, "role": "patient"}
    collection = dbmod.db.get_collection(COLLECTION)
    created_id = ""

    try:
        created = await create_prescription(
            Create(patient_id=patient_id, medication="Amlodipine", dosage="5 mg",
                   frequency="once daily", start_date="2026-10-01", end_date="2026-12-31"),
            doctor,
        )
        created_id = created["id"]
        check("create returns an id and no _id", bool(created["id"]) and "_id" not in created, str(created.keys()))
        check("create attributes the doctor", created["doctor_id"] == doctor["_id"])
        check("create stores the dates as strings",
              created["start_date"] == "2026-10-01" and created["end_date"] == "2026-12-31")

        listed = await my_prescriptions(patient_id=None, user=patient_user)
        check("the patient sees the new prescription",
              any(item["id"] == created_id for item in listed["items"]), str(listed["total"]))
        check("the list reports a total", listed["total"] >= len(listed["items"]) and listed["total"] >= 1)
        check("the list is newest first",
              listed["items"] == sorted(listed["items"], key=lambda i: i["created_at"], reverse=True))

        no_param = None
        try:
            await my_prescriptions(patient_id=None, user=doctor)
        except HTTPException as exc:
            no_param = exc.status_code
        check("a doctor must name the patient on /me", no_param == 400, str(no_param))

        denied_me = None
        try:
            await my_prescriptions(patient_id=patient_id, user=doctor)
        except HTTPException as exc:
            denied_me = exc.status_code
        check("a doctor with no appointment is refused on /me", denied_me == 403, str(denied_me))

        denied_route = None
        try:
            await patient_prescriptions(patient_id, doctor)
        except HTTPException as exc:
            denied_route = exc.status_code
        check("a doctor with no appointment is refused on /patient/{id}", denied_route == 403, str(denied_route))

        updated = await update_prescription(created_id, Update(status="completed", refills_left=1), doctor)
        check("patch changes the status", updated["status"] == "completed", updated["status"])
        check("patch keeps the id stable", updated["id"] == created_id)
        check("patch touches updated_at", updated["updated_at"] >= created["updated_at"])

        bad_status = None
        try:
            await update_prescription(created_id, Update(status="cured"), doctor)
        except HTTPException as exc:
            bad_status = exc.status_code
        check("patch refuses an unknown status", bad_status == 400, str(bad_status))

        missing = None
        try:
            await update_prescription(str(ObjectId()), Update(status="stopped"), doctor)
        except HTTPException as exc:
            missing = exc.status_code
        check("patch on an unknown id is a 404", missing == 404, str(missing))
        return None
    finally:
        if created_id:
            await collection.delete_one(id_query(created_id))
        print("  note  round-trip rows cleaned up")


reason = asyncio.run(round_trip())
if reason is None:
    print("  ok    round trip against the live collection")
else:
    skip("round trip against the live collection", reason)

# ---------------------------------------------------------------- result

print(f"\n  {checks - len(failures)}/{checks} passed, {skips} skipped\n")
if failures:
    print("  failed: " + ", ".join(failures) + "\n")
    sys.exit(1)
print("  PASS  prescriptions validate and serialise without a model\n")
