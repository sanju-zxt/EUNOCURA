"""Refresh the demo appointments onto today's date.

`seed_demo.py` stamps `appointment_date` with `datetime.now()` only when it creates
the pair. On an existing database it leaves the old date, so after a few days the
doctor dashboard legitimately shows an empty schedule. This rewrites the two demo
appointments onto today so a demo (and a screenshot) shows the real screens.
"""

import os
from datetime import datetime, time

import pymongo
from dotenv import load_dotenv

load_dotenv()
db = pymongo.MongoClient(os.getenv("MONGODB_URI")).get_default_database()

DOCTOR = "6adb10cb3c5c5d3e6c739933"
today = datetime.now().date()

docs = list(db.appointments.find({"doctor_id": DOCTOR}).sort("_id", 1))
for i, doc in enumerate(docs):
    new_date = datetime.combine(today, time(9 + i * 2, 30))
    # The dashboard prints `start_time`, not `appointment_date`, so moving only the
    # date would leave the card advertising a time from an old week.
    db.appointments.update_one(
        {"_id": doc["_id"]},
        {"$set": {"appointment_date": new_date, "start_time": new_date}},
    )
    print("updated", doc["_id"], "->", new_date)

print("--- all appointments ---")
for a in db.appointments.find({}):
    print(a["_id"], a["appointment_date"], a.get("status"), a.get("doctor_id"))
