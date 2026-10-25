"""Seed everything the demo needs, in one command.

    python tools/seed_all.py

Order matters: `seed_demo.py` creates the demo doctor/patient pair that every other
seed attaches data to. Each step is idempotent, so running this twice is safe and is
how you reset the demo after a messy rehearsal.

Requires a reachable MongoDB (see MONGODB_URI, default mongodb://localhost:27017).
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
PYTHON = sys.executable

STEPS = [
    ("demo users + appointments", "seed_demo.py"),
    ("care plan", "seed_care_plan.py"),
    ("prescriptions", "seed_prescriptions.py"),
    ("lab results", "seed_lab_results.py"),
    ("notifications", "seed_notifications.py"),
]


def run(script: str) -> tuple[bool, str]:
    proc = subprocess.run(
        [PYTHON, str(HERE / script)],
        cwd=str(BACKEND),
        capture_output=True,
        text=True,
    )
    out = (proc.stdout + proc.stderr).strip().splitlines()
    tail = "\n".join(out[-6:]) if out else "(no output)"
    return proc.returncode == 0, tail


async def mongo_reachable() -> bool:
    sys.path.insert(0, str(BACKEND))
    from src import db  # imported here so a failed import is reported as a step, not a crash

    return await db.ping()


def main() -> int:
    if not asyncio.run(mongo_reachable()):
        print("FAIL  MongoDB is not reachable - start mongod or set MONGODB_URI.")
        return 1

    failed = 0
    for label, script in STEPS:
        if not (HERE / script).exists():
            print(f"skip  {label:28s} ({script} not present)")
            continue
        ok, tail = run(script)
        print(f"{'ok  ' if ok else 'FAIL'}  {label:28s} {script}")
        print("\n".join(f"      {line}" for line in tail.splitlines()))
        failed += 0 if ok else 1

    print()
    if failed:
        print(f"FAIL  {failed} seed step(s) failed")
        return 1
    print("PASS  demo data is loaded - login demo.patient@eunocura.dev / Demo@2026")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
