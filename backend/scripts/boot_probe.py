"""Cold-import budget probe for `src.server`.

`import src.server` should cost roughly what FastAPI + pymongo cost: everything
heavy (torch, faiss, sentence-transformers, faster-whisper, langchain) is loaded
on first use, not at boot. This probe refuses to take that on trust.

It imports `src.server` in a child interpreter with `-X importtime`, prints the
wall clock plus the ten slowest modules, and exits non-zero when the budget is
blown.

    python scripts/boot_probe.py             # 15 s budget
    python scripts/boot_probe.py 8           # 8 s budget
    set BOOT_IMPORT_BUDGET_S=8 && python scripts/boot_probe.py

Exit codes: 0 within budget, 1 over budget, 2 the import itself failed.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Sequence, Tuple

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_BUDGET_S = 15.0
TOP_N = 10

_IMPORTTIME_LINE = re.compile(r"^import time:\s+(\d+)\s+\|\s+(\d+)\s+\|\s+(\S.*)$")


def budget_seconds(argv: Sequence[str]) -> float:
    """Budget from argv[1], else `BOOT_IMPORT_BUDGET_S`, else the default."""
    raw = argv[1] if len(argv) > 1 else os.getenv("BOOT_IMPORT_BUDGET_S", "")
    if not raw:
        return DEFAULT_BUDGET_S
    try:
        budget = float(raw)
    except ValueError:
        print(f"boot_probe: ignoring unparsable budget {raw!r}, using {DEFAULT_BUDGET_S}s")
        return DEFAULT_BUDGET_S
    return budget if budget > 0 else DEFAULT_BUDGET_S


def parse_importtime(stderr: str) -> Tuple[List[Tuple[float, float, str]], dict]:
    """(self_s, cumulative_s, module) rows, plus the totals for `src.server`."""
    rows: List[Tuple[float, float, str]] = []
    totals: dict = {}
    for line in stderr.splitlines():
        match = _IMPORTTIME_LINE.match(line.strip())
        if not match:
            continue
        self_us, cum_us, module = int(match.group(1)), int(match.group(2)), match.group(3)
        rows.append((self_us / 1e6, cum_us / 1e6, module))
        if module == "src.server":
            totals["src.server"] = cum_us / 1e6
    return rows, totals


def main(argv: Sequence[str]) -> int:
    budget = budget_seconds(argv)
    command = [sys.executable, "-X", "importtime", "-c", "import src.server"]

    print("EUNOCURA boot probe")
    print(f"  interpreter : {sys.executable}")
    print(f"  workdir     : {BACKEND_DIR}")
    print('  command     : python -X importtime -c "import src.server"')
    print(f"  budget      : {budget:.1f} s")

    started = time.perf_counter()
    completed = subprocess.run(
        command,
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    wall = time.perf_counter() - started

    # Modules print status lines on import; the importtime rows are on stderr.
    chatter = [line for line in completed.stdout.splitlines() if line.strip()]
    rows, totals = parse_importtime(completed.stderr)

    print(f"  wall clock  : {wall:.2f} s")
    if "src.server" in totals:
        print(f"  importtime  : {totals['src.server']:.2f} s cumulative (src.server)")

    if completed.returncode != 0:
        print()
        print(f"FAIL: importing src.server raised (child exit {completed.returncode})")
        for line in (completed.stderr.splitlines() + chatter)[-25:]:
            print(f"  {line}")
        return 2

    print()
    print(f"{TOP_N} slowest imported modules (self time)")
    print(f"  {'#':>2}  {'self(s)':>8}  {'cum(s)':>8}  module")
    for rank, (self_s, cum_s, module) in enumerate(
        sorted(rows, key=lambda row: row[0], reverse=True)[:TOP_N], start=1
    ):
        print(f"  {rank:>2}  {self_s:8.3f}  {cum_s:8.3f}  {module}")

    print()
    if wall > budget:
        print(f"FAIL: src.server took {wall:.2f} s to import, budget is {budget:.1f} s")
        return 1
    print(f"PASS: src.server imported in {wall:.2f} s (budget {budget:.1f} s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
