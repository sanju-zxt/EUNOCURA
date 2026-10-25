# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Offline tests for lab results. No MongoDB, no token, no network.

    cd backend
    python tests/test_lab_results.py

The interesting part is not CRUD, it is the reference-range rule: a creatinine of
3.1 mg/dL must never be stored, or served, as "normal" just because the client
said so. Everything below runs without a database on purpose - the rule has to
hold at the venue with no wifi.
"""

from __future__ import annotations

import pathlib
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from bson import ObjectId  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from src import db as dbmod  # noqa: E402
from src.models.lab_result import LabResultCreate, derive_status  # noqa: E402
from src.routes import lab_result as lr  # noqa: E402

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


# ---------------------------------------------------------------- fixtures

def payload(**overrides) -> LabResultCreate:
    body = {
        "patient_id": "64b7f0c2a1b2c3d4e5f60718",
        "test_name": "Serum creatinine",
        "value": 1.1,
        "unit": "mg/dL",
        "reference_low": 0.6,
        "reference_high": 1.2,
    }
    body.update(overrides)
    return LabResultCreate(**body)


# ---------------------------------------------------------------- tests

print("\nlab results\n")

# 1. the reference-range rule, including both boundaries
check("inside the range is normal", derive_status(1.1, 0.6, 1.2) == "normal")
check("exactly at reference_low is normal", derive_status(0.6, 0.6, 1.2) == "normal")
check("exactly at reference_high is normal", derive_status(1.2, 0.6, 1.2) == "normal")
check("a hair under reference_low is low", derive_status(0.599, 0.6, 1.2) == "low")
check("a hair over reference_high is high", derive_status(1.201, 0.6, 1.2) == "high")
check("above the range is high", derive_status(3.1, 0.6, 1.2) == "high")
check("below the range is low", derive_status(9.8, 12.0, 15.5) == "low")

# 2. ranges that cannot classify anything
check("missing low is normal, not guessed", derive_status(3.1, None, 1.2) == "normal")
check("missing high is normal, not guessed", derive_status(3.1, 0.6, None) == "normal")
check("no range at all is normal", derive_status(3.1, None, None) == "normal")
check("inverted range is normal, not a diagnosis", derive_status(3.1, 1.2, 0.6) == "normal")
check("zero-height range only accepts that exact value",
      derive_status(5.0, 5.0, 5.0) == "normal")
check("zero-height range rejects a neighbour", derive_status(5.1, 5.0, 5.0) == "high")
check("a non-finite value is not classified", derive_status(float("nan"), 0.6, 1.2) == "normal")

# 3. the client cannot supply the status
doc = lr.build_lab_result_document(
    payload(value=3.1, reference_low=0.6, reference_high=1.2, status="normal")
)
check("a client-supplied 'normal' is ignored", doc["status"] == "high", doc["status"])

doc = lr.build_lab_result_document(
    payload(value=1.1, reference_low=0.6, reference_high=1.2, status="high")
)
check("a client-supplied 'high' is ignored", doc["status"] == "normal", doc["status"])

doc = lr.build_lab_result_document(payload(value=1.1, reference_low=None, reference_high=None, status="low"))
check("no range, no client status", doc["status"] == "normal", doc["status"])

# 4. the document we store
doc = lr.build_lab_result_document(payload(test_name="  HbA1c ", unit=" % "))
check("test_name is trimmed", doc["test_name"] == "HbA1c", doc["test_name"])
check("unit is trimmed", doc["unit"] == "%", doc["unit"])
check("value is a float", isinstance(doc["value"], float))
check("taken_at defaults to now (UTC)",
      abs((doc["taken_at"] - datetime.now(timezone.utc).replace(tzinfo=None)).total_seconds()) < 60)
check("taken_at is naive UTC", doc["taken_at"].tzinfo is None)
check("source defaults to manual", doc["source"] == "manual")

stored = lr.build_lab_result_document(payload(taken_at=datetime(2026, 8, 12, 9, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))))
check("an offset timestamp is stored as UTC", stored["taken_at"] == datetime(2026, 8, 12, 3, 30), str(stored["taken_at"]))

# 5. reads re-derive the status, so a hand-edited document cannot lie
lying = {
    "_id": ObjectId("64b7f0c2a1b2c3d4e5f60718"),
    "patient_id": "p1",
    "test_name": "Serum creatinine",
    "value": 3.1,
    "unit": "mg/dL",
    "reference_low": 0.6,
    "reference_high": 1.2,
    "status": "normal",  # edited in Compass
    "taken_at": datetime(2026, 8, 12, 3, 30),
    "source": "manual",
    "note": None,
}
record = lr.to_record(lying)
check("stored 'normal' is re-derived to 'high'", record.status == "high", record.status)
check("_id becomes id", record.id == "64b7f0c2a1b2c3d4e5f60718", record.id)
check("_id is not leaked", "_id" not in record.model_dump())
check("taken_at is ISO-8601 UTC", record.taken_at.startswith("2026-08-12T03:30:00"), record.taken_at)
check("the serialised timestamp parses back", datetime.fromisoformat(record.taken_at) == datetime(2026, 8, 12, 3, 30, tzinfo=timezone.utc))
check("a missing unit becomes an empty string", lr.to_record({**lying, "unit": None}).unit == "")

# 6. series: grouped by test, oldest point first, short keys
docs = [
    {"_id": "b", "patient_id": "p1", "test_name": "HbA1c", "value": 7.1, "unit": "%",
     "reference_low": 4.0, "reference_high": 5.7, "taken_at": datetime(2026, 10, 2), "source": "manual"},
    {"_id": "a", "patient_id": "p1", "test_name": "HbA1c", "value": 8.4, "unit": "%",
     "reference_low": 4.0, "reference_high": 5.7, "taken_at": datetime(2026, 4, 12), "source": "manual"},
    {"_id": "c", "patient_id": "p1", "test_name": "Serum creatinine", "value": 1.0, "unit": "mg/dL",
     "reference_low": 0.6, "reference_high": 1.2, "taken_at": "2026-06-01T00:00:00Z", "source": "document"},
]
series = lr.build_series(docs)
check("one series per test name", set(series) == {"HbA1c", "Serum creatinine"}, str(set(series)))
check("points are sorted by taken_at ascending",
      [p.v for p in series["HbA1c"]] == [8.4, 7.1], str([p.v for p in series["HbA1c"]]))
check("a point carries t, v, unit, status",
      set(series["HbA1c"][0].model_dump()) == {"t", "v", "unit", "status"},
      str(set(series["HbA1c"][0].model_dump())))
check("status is derived in the series", series["HbA1c"][0].status == "high")
check("an ISO string timestamp still sorts", series["Serum creatinine"][0].v == 1.0)
check("an empty collection is an empty dict", lr.build_series([]) == {})

# 7. who may read whose results
patient = {"_id": "p1", "role": "patient"}
doctor = {"_id": "d1", "role": "doctor"}
check("a patient reads their own", lr.resolve_patient_scope(patient, None) == "p1")
check("a patient may pass their own id", lr.resolve_patient_scope(patient, "p1") == "p1")

try:
    lr.resolve_patient_scope(patient, "p2")
    check("a patient may not read another patient", False, "no exception")
except HTTPException as exc:
    check("a patient may not read another patient", exc.status_code == 403, str(exc.status_code))

check("a doctor names the patient", lr.resolve_patient_scope(doctor, "p2") == "p2")

try:
    lr.resolve_patient_scope(doctor, None)
    check("a doctor without patient_id is refused", False, "no exception")
except HTTPException as exc:
    check("a doctor without patient_id is refused", exc.status_code == 400, str(exc.status_code))

# 8. bad input is rejected, not coerced
try:
    payload(reference_low=1.2, reference_high=0.6)
    check("an inverted range is rejected on create", False, "no exception")
except ValidationError:
    check("an inverted range is rejected on create", True)

try:
    payload(test_name="   ")
    check("a blank test name is rejected", False, "no exception")
except ValidationError:
    check("a blank test name is rejected", True)

try:
    payload(value=float("nan"))
    check("a NaN value is rejected", False, "no exception")
except ValidationError:
    check("a NaN value is rejected", True)

# 9. no database means 503 with a fixable hint
original = getattr(dbmod, "db", None)
try:
    dbmod.db = None
    try:
        lr._collection()
        check("a missing database is a 503", False, "no exception")
    except HTTPException as exc:
        check("a missing database is a 503", exc.status_code == 503, str(exc.status_code))
        check("the 503 says how to fix it", "mongod" in str(exc.detail) and "MONGODB_URI" in str(exc.detail), str(exc.detail))
finally:
    dbmod.db = original

# 10. the three contract paths exist
paths = [route.path for route in lr.router.routes]
check("GET /me/series exists", "/me/series" in paths, str(paths))
check("GET /me exists", "/me" in paths, str(paths))
check("POST / exists", "/" in paths, str(paths))

# ---------------------------------------------------------------- result

print(f"\n  {checks - len(failures)}/{checks} passed\n")
if failures:
    print("  failed: " + ", ".join(failures) + "\n")
    sys.exit(1)
print("  PASS  lab-result status is derived, never trusted\n")
