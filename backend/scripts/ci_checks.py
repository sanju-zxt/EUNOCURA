# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""The CI gate for EUNOCURA. One command, no third-party test runner.

    cd backend
    python scripts/ci_checks.py          # or from the repo root:
    python backend/scripts/ci_checks.py

Checks, in order:

  1. every python file compiles (compileall over src, tests, tools, scripts)
  2. each backend/tests/test_*.py runs to completion in its own subprocess
  3. the API boots and exposes the frozen contract paths (/healthz, /auth/login,
     /citations/audit, /care-plan/me, /lab-results/me, /prescriptions/me,
     /notifications/me), and boot stays under a generous time budget
  4. no source file under backend/src carries a hardcoded secret
  5. frontend/dist is not committed and backend/.env is gitignored

Exit codes: 0 = every check passed, 1 = at least one check failed.
pytest is deliberately not used: the suites under tests/ are plain scripts that
print their own PASS/FAIL and set their own exit code, and the deployment must
stay installable from requirements.txt alone.
"""

from __future__ import annotations

import fnmatch
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Sequence, Tuple

HERE = Path(__file__).resolve()
SCRIPTS = HERE.parent
BACKEND = SCRIPTS.parent
REPO = BACKEND.parent

COMPILE_DIRS = ("src", "tests", "tools", "scripts")

# Frozen API contract (COMPLETE-SPEC.md). If a router stops being mounted, the
# frontend silently falls back to fixtures, so this is a release blocker.
CONTRACT_PATHS = (
    "/healthz",
    "/auth/login",
    "/citations/audit",
    "/care-plan/me",
    "/lab-results/me",
    "/prescriptions/me",
    "/notifications/me",
)

# Generous on purpose: this is a regression guard, not a benchmark. The whole
# machine can be slow (cold import cache, constrained CI runner) and that is
# fine; a boot that takes minutes is not.
BOOT_BUDGET_SECONDS = 300.0
BOOT_TIMEOUT_SECONDS = 540.0
COMPILE_TIMEOUT_SECONDS = 180.0
TEST_TIMEOUT_SECONDS = 300.0

# Secret shapes worth failing the build over. `sk-` and `AKIA` are anchored on a
# boundary so ordinary prose ("task-list", "risk-averse") cannot trip them.
SECRET_PATTERNS = (
    ("openai-style key", r"\bsk-[A-Za-z0-9_\-]{8,}"),
    ("aws access key id", r"\bAKIA[0-9A-Z]{8,}"),
    ("private key block", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("hardcoded password", r"password\s*=\s*[\"'][^\"']+[\"']"),
)

SCAN_SUFFIXES = {".py", ".json", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".txt", ".sh", ".js"}
SKIP_DIRS = {"__pycache__", ".venv", "venv", "node_modules", ".git"}

rows: List[Tuple[str, str, str]] = []


def record(status: str, name: str, note: str = "") -> None:
    rows.append((status, name, note))
    print(f"  {status:<4}  {name:<18}  {note}", flush=True)


def child_env() -> dict:
    env = dict(os.environ)
    # Tests do their own sys.path insert; PYTHONPATH keeps `src` importable even
    # when a caller runs this from somewhere unexpected.
    env["PYTHONPATH"] = str(BACKEND) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def run(argv: Sequence[str], *, cwd: Path, timeout: float) -> subprocess.CompletedProcess:
    return subprocess.run(
        list(argv),
        cwd=str(cwd),
        env=child_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
        encoding="utf-8",
        errors="replace",
    )


def tail(text: str, lines: int = 12) -> List[str]:
    return [line for line in text.strip().splitlines() if line.strip()][-lines:]


# ---------------------------------------------------------------- 1. compile


def check_compileall() -> None:
    targets = [d for d in COMPILE_DIRS if (BACKEND / d).is_dir()]
    if not targets:
        record("FAIL", "compileall", f"none of {COMPILE_DIRS} exist under {BACKEND}")
        return
    try:
        done = run(
            [sys.executable, "-m", "compileall", "-q", *targets],
            cwd=BACKEND,
            timeout=COMPILE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        record("FAIL", "compileall", f"timed out after {COMPILE_TIMEOUT_SECONDS:.0f}s")
        return
    if done.returncode == 0:
        record("PASS", "compileall", ", ".join(targets))
        return
    record("FAIL", "compileall", f"exit {done.returncode}")
    for line in tail(done.stdout or "", 20):
        print(f"        {line}")


# ---------------------------------------------------------------- 2. tests


def check_tests() -> None:
    test_files = sorted((BACKEND / "tests").glob("test_*.py"))
    if not test_files:
        record("FAIL", "tests", "no backend/tests/test_*.py found")
        return
    failed = 0
    for path in test_files:
        name = path.name
        started = time.perf_counter()
        try:
            done = run([sys.executable, str(path)], cwd=BACKEND, timeout=TEST_TIMEOUT_SECONDS)
            output = done.stdout or ""
            code = done.returncode
        except subprocess.TimeoutExpired:
            record("FAIL", f"test {name}", f"timed out after {TEST_TIMEOUT_SECONDS:.0f}s")
            failed += 1
            continue
        seconds = time.perf_counter() - started
        last = tail(output, 1)
        last_line = last[0].strip() if last else "(no output)"
        if code == 0:
            record("PASS", f"test {name}", f"{last_line}  [{seconds:.1f}s]")
        else:
            record("FAIL", f"test {name}", f"exit {code}: {last_line}  [{seconds:.1f}s]")
            for line in tail(output, 12):
                print(f"        {line}")
            failed += 1
    if failed:
        record("FAIL", "tests", f"{failed}/{len(test_files)} suites failed")
    else:
        record("PASS", "tests", f"{len(test_files)}/{len(test_files)} suites passed")


# ---------------------------------------------------------------- 3. boot

BOOT_PROBE = """
import json, sys, time, traceback

PATHS = {paths!r}
started = time.perf_counter()
try:
    from src.server import app
    elapsed = time.perf_counter() - started
    table = app.openapi().get("paths", {{}})
    print("BOOT_JSON " + json.dumps({{
        "elapsed": round(elapsed, 3),
        "missing": [p for p in PATHS if p not in table],
        "routes": len(app.routes),
        "documented": len(table),
    }}))
except BaseException:
    traceback.print_exc()
    sys.exit(1)
"""


def check_boot() -> None:
    script = BOOT_PROBE.format(paths=list(CONTRACT_PATHS))
    started = time.perf_counter()
    try:
        done = run([sys.executable, "-c", script], cwd=BACKEND, timeout=BOOT_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        record("FAIL", "boot", f"import src.server did not finish in {BOOT_TIMEOUT_SECONDS:.0f}s")
        return
    wall = time.perf_counter() - started
    payload = None
    for line in (done.stdout or "").splitlines():
        if line.startswith("BOOT_JSON "):
            try:
                payload = json.loads(line[len("BOOT_JSON "):])
            except ValueError:
                payload = None
    if done.returncode != 0 or payload is None:
        record("FAIL", "boot", f"import src.server raised (exit {done.returncode})")
        for line in tail(done.stdout or "", 20):
            print(f"        {line}")
        return

    elapsed = float(payload["elapsed"])
    missing = payload["missing"]
    summary = (
        f"{elapsed:.1f}s to boot, {payload['routes']} routes, "
        f"{payload['documented']} documented paths"
    )
    if missing:
        record("FAIL", "boot", f"{summary}; missing: {', '.join(missing)}")
    elif elapsed > BOOT_BUDGET_SECONDS:
        record("FAIL", "boot", f"{summary}; over the {BOOT_BUDGET_SECONDS:.0f}s budget")
    else:
        record("PASS", "boot", summary)
    if wall > elapsed + 5:
        print(f"        (subprocess wall time {wall:.1f}s, python-side {elapsed:.1f}s)")


# ---------------------------------------------------------------- 4. secrets


def check_secrets() -> None:
    import re

    root = BACKEND / "src"
    if not root.is_dir():
        record("FAIL", "secrets", f"{root} does not exist")
        return
    compiled = [(label, re.compile(pattern)) for label, pattern in SECRET_PATTERNS]
    hits: List[str] = []
    scanned = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        scanned += 1
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            record("FAIL", "secrets", f"unreadable: {path} ({exc})")
            return
        for number, line in enumerate(text.splitlines(), start=1):
            for label, pattern in compiled:
                match = pattern.search(line)
                if match:
                    where = f"{path.relative_to(REPO).as_posix()}:{number}"
                    hits.append(f"{where} {label} -> {match.group(0)[:40]!r}")
    if hits:
        record("FAIL", "secrets", f"{len(hits)} hardcoded secret(s) in backend/src")
        for hit in hits:
            print(f"        {hit}")
        return
    record("PASS", "secrets", f"{scanned} files under backend/src, no key material")


# ---------------------------------------------------------------- 5. gitignore


def gitignore_rules() -> List[str]:
    path = REPO / ".gitignore"
    if not path.is_file():
        return []
    rules = []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            rules.append(line)
    return rules


def rule_matches(pattern: str, rel_path: str) -> bool:
    """Minimal gitignore semantics: enough for the rules this repo relies on."""
    rule = pattern.rstrip("/")
    if not rule:
        return False
    anchored = rule.startswith("/") or "/" in rule
    rule = rule.lstrip("/")
    if anchored:
        return rel_path == rule or rel_path.startswith(rule + "/")
    return any(fnmatch.fnmatch(part, rule) for part in rel_path.split("/"))


def ignored_by(rules: Sequence[str], rel_path: str) -> str | None:
    """Return the rule that ignores rel_path, or None. Last match wins, as in git."""
    winner = None
    for rule in rules:
        negative = rule.startswith("!")
        candidate = rule[1:] if negative else rule
        if rule_matches(candidate, rel_path):
            winner = None if negative else rule
    return winner


def check_gitignore() -> None:
    rules = gitignore_rules()
    if not rules:
        record("FAIL", "gitignore", f"no rules found in {REPO / '.gitignore'}")
        return

    failures = 0
    for rel_path in ("backend/.env", "frontend/dist"):
        rule = ignored_by(rules, rel_path)
        if rule:
            record("PASS", "gitignore", f"{rel_path} is ignored by rule `{rule}`")
        else:
            record("FAIL", "gitignore", f"{rel_path} is NOT ignored by .gitignore")
            failures += 1

    # Belt and braces: the tree itself must not carry these, ignored or not.
    try:
        done = run(["git", "ls-files", "backend/.env", "frontend/dist"], cwd=REPO, timeout=60)
    except (FileNotFoundError, OSError):
        record("WARN", "gitignore", "git not available — tracked-file check skipped")
    except subprocess.TimeoutExpired:
        record("FAIL", "gitignore", "git ls-files timed out")
        failures += 1
    else:
        if done.returncode != 0:
            record("WARN", "gitignore", "not a git work tree — tracked-file check skipped")
        else:
            tracked = [line.strip() for line in (done.stdout or "").splitlines() if line.strip()]
            if tracked:
                record("FAIL", "gitignore", f"committed: {', '.join(tracked[:5])}")
                failures += 1
            else:
                record("PASS", "gitignore", "nothing matching backend/.env or frontend/dist is tracked")
    if failures:
        record("FAIL", "gitignore", f"{failures} problem(s)")


# ---------------------------------------------------------------- main


def main() -> int:
    if not (BACKEND / "src").is_dir():
        print(f"  cannot find backend/src from {HERE} — repo layout changed?", flush=True)
        return 1

    print("\n  EUNOCURA CI checks\n", flush=True)
    started = time.perf_counter()

    check_compileall()
    check_tests()
    check_boot()
    check_secrets()
    check_gitignore()

    failures = sum(1 for status, _, _ in rows if status == "FAIL")
    warnings = sum(1 for status, _, _ in rows if status == "WARN")
    elapsed = time.perf_counter() - started
    print(
        f"\n  {len(rows)} checks · {len(rows) - failures - warnings} pass · "
        f"{warnings} warn · {failures} fail · {elapsed:.1f}s\n",
        flush=True,
    )
    if failures:
        print("  CI FAILED — fix the FAIL lines above.\n", flush=True)
        return 1
    print("  CI PASSED\n", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
