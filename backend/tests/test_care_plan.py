# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Offline tests for the care plan payload. No Mongo, no API key, no network.

    cd backend
    python tests/test_care_plan.py

The validator is the whole contract: a doctor's typed plan either matches the
frozen item shape or it is rejected with a message naming the item and field.
An absent plan must stay absent — `{"items": [], "source": null}` — because an
empty screen is honest and an invented plan is a clinical lie.
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.models.care_plan import (  # noqa: E402
    MAX_FIELD,
    MAX_ITEMS,
    MAX_NOTE,
    CarePlanValidationError,
    empty_plan,
    plan_from_document,
    validate_items,
    validate_plan_payload,
)

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


def item(slot: str = "Breakfast", title: str = "Oats", detail: str = "40 g") -> dict:
    return {"slot": slot, "title": title, "detail": detail}


def rejects(name: str, payload: object, needle: str) -> None:
    """Assert a bad payload raises, and that the message points at the problem."""
    try:
        validate_plan_payload(payload)
    except CarePlanValidationError as exc:
        check(name, needle in str(exc), str(exc))
    else:
        check(name, False, "no error raised")


# ---------------------------------------------------------------- happy path

print("\ncare plan payload\n")

plan = validate_plan_payload(
    {
        "diet": [
            item("Breakfast", "Oats with milk", "40 g oats, 200 ml toned milk"),
            item("Lunch", "Dal and rice", "One katori dal, half cup rice"),
        ],
        "activity": [item("Morning", "Walk", "20 minutes, flat ground")],
        "notes": "Stop and sit if you feel breathless.",
    }
)
check("two diet items survive", len(plan["diet"]) == 2, str(len(plan["diet"])))
check("activity section is separate", len(plan["activity"]) == 1)
check("notes survive", plan["notes"].startswith("Stop and sit"), plan["notes"])
check(
    "items carry exactly slot, title, detail",
    set(plan["diet"][0]) == {"slot", "title", "detail"},
    str(sorted(plan["diet"][0])),
)

# 1. whitespace is normalised, not trusted
plan = validate_plan_payload(
    {"diet": [item("  Breakfast ", " Oats   with\tmilk ", "40 g")]}
)
check("slot is trimmed", plan["diet"][0]["slot"] == "Breakfast", plan["diet"][0]["slot"])
check(
    "inner whitespace collapses",
    plan["diet"][0]["title"] == "Oats with milk",
    plan["diet"][0]["title"],
)
check(
    "notes keep their line breaks",
    validate_plan_payload({"notes": "line one\n\n  line two  "})["notes"]
    == "line one\nline two",
)

# 2. optional sections default instead of blowing up
plan = validate_plan_payload({})
check("empty body is a valid empty plan", plan == {"diet": [], "activity": [], "notes": ""}, str(plan))
check("diet null is an empty section", validate_plan_payload({"diet": None})["diet"] == [])
check("notes empty string is allowed", validate_plan_payload({"notes": ""})["notes"] == "")
check("notes whitespace is allowed", validate_plan_payload({"notes": "   "})["notes"] == "")

# 3. unknown keys never reach the database
plan = validate_plan_payload(
    {"diet": [{**item(), "id": "abc", "checked": True}], "patient_id": "507f"}
)
check("unknown item keys are dropped", set(plan["diet"][0]) == {"slot", "title", "detail"})
check("patient_id is not copied into the plan", "patient_id" not in plan, str(sorted(plan)))

# ---------------------------------------------------------------- bad shape

rejects("diet as a string is rejected", {"diet": "oats"}, "diet must be a list")
rejects("diet as an object is rejected", {"diet": {"slot": "x"}}, "diet must be a list")
rejects("activity null-like string is rejected", {"activity": "walk"}, "activity must be a list")
rejects("a bare string item is rejected", {"diet": ["oats"]}, "diet[0] must be an object")
rejects("a list item is rejected", {"diet": [[1, 2]]}, "diet[0] must be an object")
rejects("missing title names the field", {"diet": [{"slot": "x", "detail": "y"}]}, "missing title")
rejects("missing detail names the field", {"diet": [{"slot": "x", "title": "y"}]}, "missing detail")
rejects("missing slot names the field", {"diet": [{"title": "y", "detail": "z"}]}, "missing slot")
rejects("integer title is rejected", {"diet": [item(title=5)]}, "diet[0].title must be a string")
rejects("null detail is rejected", {"diet": [item(detail=None)]}, "diet[0].detail must be a string")
rejects("empty slot is rejected", {"activity": [item(slot="")]}, "activity[0].slot must not be empty")
rejects("whitespace-only title is rejected", {"diet": [item(title="   ")]}, "must not be empty")
rejects("a second bad item is numbered", {"diet": [item(), item(title=7)]}, "diet[1].title")
rejects(
    "an over-long field is rejected",
    {"diet": [item(detail="x" * (MAX_FIELD + 1))]},
    f"limit is {MAX_FIELD}",
)
rejects("integer notes are rejected", {"notes": 5}, "notes must be a string")
rejects("a list of notes is rejected", {"notes": ["a"]}, "notes must be a string")
rejects("over-long notes are rejected", {"notes": "n" * (MAX_NOTE + 1)}, "limit is 4000")
rejects("a non-object body is rejected", ["not", "a", "plan"], "body must be an object")
rejects("diet given as a tuple is rejected", {"diet": (item(),)}, "diet must be a list")

# 4. the list cap is real, and it is exactly MAX_ITEMS
at_limit = {"diet": [item(title=f"Item {i}") for i in range(MAX_ITEMS)]}
check(
    f"{MAX_ITEMS} items is accepted",
    len(validate_plan_payload(at_limit)["diet"]) == MAX_ITEMS,
)
rejects(
    f"{MAX_ITEMS + 1} items is rejected",
    {"diet": [item(title=f"Item {i}") for i in range(MAX_ITEMS + 1)]},
    f"limit is {MAX_ITEMS}",
)
rejects(
    "the cap message counts the items offered",
    {"activity": [item() for _ in range(MAX_ITEMS + 5)]},
    f"has {MAX_ITEMS + 5} items",
)

# 5. validate_items stands alone (the route imports it through the payload guard)
check("validate_items(None) is empty", validate_items(None, "diet") == [])
check("validate_items keeps order", [i["title"] for i in validate_items(
    [item(title="a"), item(title="b")], "diet"
)] == ["a", "b"])

# ---------------------------------------------------------------- documents

check("no plan is the honest empty", empty_plan() == {"items": [], "source": None}, str(empty_plan()))
check("no plan invents no source", empty_plan()["source"] is None)
check("no plan invents no items", empty_plan()["items"] == [])

doc = {
    "_id": "665f1c2a9b1e4a0012ab34cd",
    "patient_id": "665f1c2a9b1e4a0012ab0001",
    "diet": [item("Breakfast", "Oats", "40 g")],
    "activity": [item("Evening", "Walk", "20 min")],
    "notes": "review in 2 weeks",
    "author_id": "665f1c2a9b1e4a0012ab00ff",
    "source": "clinician",
    "updated_at": "2026-10-25T09:30:00+00:00",
}
out = plan_from_document(doc)
check("_id is serialised to id", out["id"] == doc["_id"] and "_id" not in out, str(sorted(out)))
check("diet and activity stay sectioned", len(out["diet"]) == 1 and len(out["activity"]) == 1)
check(
    "items flattens diet then activity",
    [i["title"] for i in out["items"]] == ["Oats", "Walk"],
    str(out["items"]),
)
check("source is clinician", out["source"] == "clinician")
check("updated_at passes through as ISO text", out["updated_at"] == "2026-10-25T09:30:00+00:00")

blank = plan_from_document({"_id": "x", "diet": None, "activity": None, "notes": None})
check("a half-written document still serialises", blank["diet"] == [] and blank["activity"] == [])
check("a missing source is labelled clinician", blank["source"] == "clinician")
check("a missing notes field is empty text", blank["notes"] == "")

# ---------------------------------------------------------------- result

print(f"\n  {checks - len(failures)}/{checks} passed\n")
if failures:
    print("  failed: " + ", ".join(failures) + "\n")
    sys.exit(1)
print("  PASS  the care plan contract holds without a database\n")
