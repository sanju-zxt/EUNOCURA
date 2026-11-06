"""Undo the state change a screenshot run makes.

`work/screens.mjs` presses the real START SESSION button so the active-session
screen is captured from reachable state. That flips the appointment to
`in_progress`, which is a clinical-looking field. This puts it back so running the
capture never leaves the demo in a state a reviewer would have to explain.
"""

import os

import pymongo
from dotenv import load_dotenv

load_dotenv()
db = pymongo.MongoClient(os.getenv("MONGODB_URI")).get_default_database()

APPOINTMENTS = [
    "6adb53a24f073273bef61b06-0",  # the account created through the signup form
    "6adb5877b87f2b4006ad3638-0",  # demo.patient (Asha Rao)
]

for appt in APPOINTMENTS:
    result = db.appointments.update_one({"_id": appt}, {"$set": {"status": "scheduled"}})
    print("reset", appt, "-> scheduled, matched", result.matched_count, "changed", result.modified_count)
