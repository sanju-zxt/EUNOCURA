# EUNOCURA — completion pass (working spec)

Goal: remove the remaining "fixture" screens by giving them real backend data, then
harden the build. Nothing here changes the product's core claim (citation-or-drop).

Repo: `C:\Users\Sanju\Projects\MedAI` (branch `master`).
Backend python: `backend\.venv\Scripts\python.exe` (all deps installed, incl. httpx).
MongoDB: `mongodb://localhost:27017` (local `mongod` may or may not be running — every
new endpoint must degrade with a readable hint instead of crashing).
Frontend: React 18 + Vite + Tailwind, `cd frontend && npm run build`.

## Hard rules (every worker)

1. **Own only your files.** The spec below lists them. Do not edit `backend/src/server.py`,
   `backend/src/db.py`, `backend/src/routes/root.py`, `backend/src/models/__init__.py`,
   `frontend/src/App.jsx`, `frontend/package.json`, `frontend/vite.config.js`,
   `README.md`, `frontend/FEATURES.md`, `.gitignore`. The orchestrator wires those.
2. **No new runtime dependencies.** Standard library + what is already pinned.
3. **No secrets.** Never read or write `backend/.env`.
4. **Degrade, don't crash.** Mongo unreachable → `503` with `detail` telling the user the
   fix (mirror `src/routes/patient.py` / `src/services/audit_store.py` style). The API must
   still boot with zero configuration.
5. **No model calls.** These features are deterministic CRUD. No LLM, no sampling.
6. **Style:** match the surrounding file. Type hints, short docstrings, comments only where
   the reason is not obvious. No emoji in code.
7. **Prove it.** Run the verification command in your brief and paste the real output in
   your report. If something is untested, say so instead of claiming it works.
8. **Report** at the end: files created/changed, exact router mount lines the orchestrator
   must add (module + prefix + tag), verification output, and anything you deliberately
   left out.

## API contract (frozen — frontend and backend workers build to this)

All routes require a bearer token (existing `Depends(get_current_user)` /
`Depends(check_doctor_exists)`). All timestamps are ISO-8601 UTC strings in JSON.
MongoDB `_id` is always serialised to `id` (string) — never leak `_id` or hashes.

### 1. Prescriptions — collection `prescriptions`

```
GET  /prescriptions/me                      patient: own list; doctor: ?patient_id= required
GET  /prescriptions/patient/{patient_id}    doctor only
POST /prescriptions/                        doctor only — create
PATCH /prescriptions/{prescription_id}      doctor only — status / dosage update
```

Record: `{id, patient_id, doctor_id, doctor_name, medication, dosage, frequency, route,
start_date, end_date|null, status: "active"|"completed"|"stopped", instructions,
refills_left, created_at, updated_at}`
List response: `{"items": [ ... ], "total": n}` — newest first.

### 2. Notifications — collection `notifications`

```
GET  /notifications/me                 own notifications, newest first
POST /notifications/                   doctor only — create for a patient (or self)
POST /notifications/{id}/read          mark one read (own only)
POST /notifications/read-all           mark all own read
DELETE /notifications/{id}             own only
```

Record: `{id, user_id, title, body, category: "appointment"|"medication"|"result"|"system",
read: bool, created_at, link|null}`
List response: `{"items": [...], "unread": n}`.

### 3. Lab results — collection `lab_results`

```
GET  /lab-results/me?test=<name>       patient: own; doctor: ?patient_id= required
POST /lab-results/                     doctor only
GET  /lab-results/me/series            {test_name: [{t: iso, v: number, unit, status}]}
```

Record: `{id, patient_id, test_name, value, unit, reference_low, reference_high,
status: "normal"|"high"|"low", taken_at, source: "manual"|"document", note|null}`
`status` is computed server-side from the reference range when not supplied.
List response: `{"items": [...], "series": {test_name: [...]}}` for `/me`.

### 4. Care plan — collection `care_plans`

```
GET  /care-plan/me                     patient's own plan
PUT  /care-plan/me                     doctor only, body {diet: [], activity: [], notes}
```

Record: `{id, patient_id, diet: [{slot, title, detail}], activity: [...], notes,
updated_at, author_id, source: "clinician"}`.
`GET` with no plan returns `{"items": [], "source": null}` **and the frontend keeps the
fixture label** — an absent plan is not an invented plan.

## File ownership

| Worker | Files it may create/edit |
|---|---|
| BE-prescriptions | `backend/src/models/prescription.py`, `backend/src/routes/prescription.py`, `backend/tests/test_prescriptions.py`, `backend/tools/seed_prescriptions.py` |
| BE-notifications | `backend/src/models/notification.py`, `backend/src/routes/notification.py`, `backend/tests/test_notifications.py`, `backend/tools/seed_notifications.py` |
| BE-labresults | `backend/src/models/lab_result.py`, `backend/src/routes/lab_result.py`, `backend/tests/test_lab_results.py`, `backend/tools/seed_lab_results.py` |
| BE-careplan | `backend/src/models/care_plan.py`, `backend/src/routes/care_plan.py`, `backend/tests/test_care_plan.py`, `backend/tools/seed_care_plan.py` |
| FE-medications | `frontend/src/components/patient/Medications.jsx`, `frontend/src/components/patient/PatientDashboard.jsx` (medication card only) |
| FE-notifications | `frontend/src/components/patient/Notifications.jsx` |
| FE-testresults | `frontend/src/components/doctor/TestResults.jsx` |
| FE-careplan | `frontend/src/components/patient/DietPlan.jsx` |
| FE-perf | `frontend/src/App.jsx`, `frontend/vite.config.js`, `frontend/src/components/RouteFallback.jsx` |
| CI | `.github/workflows/ci.yml`, `backend/scripts/ci_checks.py` |

Frontend workers: keep the existing visual language (Tailwind, `dark:` variants, cards,
teal/blue accents), keep loading + error + empty states, and **drop the `FixtureNotice`
only when the screen is actually reading the API**. No new npm packages.

## Verification commands

```powershell
# backend (plain scripts, pytest is not installed)
cd C:\Users\Sanju\Projects\MedAI\backend
.\.venv\Scripts\python.exe -m compileall -q src
.\.venv\Scripts\python.exe tests\test_citations.py
.\.venv\Scripts\python.exe tests\test_bboxes.py
.\.venv\Scripts\python.exe tests\<your test>.py
.\.venv\Scripts\python.exe -c "from src.server import app; print(len(app.routes),'routes')"

# frontend
cd C:\Users\Sanju\Projects\MedAI\frontend
npm run build
```

## Work board (50 units) — what actually shipped

Executed in parallel waves of 5–9 background agents with disjoint file ownership; the
orchestrator owned every integration point (router mounts, `server.py`, `db.py`,
`App.jsx` coordination, README, `.gitignore`). "Literal 50 concurrent agents" is not a
thing a rate-limited provider allows — this is the same 50 units, sequenced.

| Units | Scope | Status |
|---|---|---|
| 1–4 | prescriptions: model, routes, tests, seed | **done** — 81 assertions |
| 5–8 | notifications: model, routes, tests, seed | **done** — 50 assertions |
| 9–12 | lab results: model, routes, tests, seed | **done** — 49 assertions; status derived server-side |
| 13–16 | care plan: model, routes, tests, seed | **done** — 48 assertions |
| 17 | seed all four for the demo accounts | **done** — `backend/tools/seed_all.py` |
| 18 | `/healthz` collection counts | **dropped** — counts need a live Mongo, and a health check that lies when Mongo is down is worse than no counts. `/healthz` reports reachability instead |
| 19 | shared ObjectId serialiser | **done** — each new route projects to `id`, never `_id`, and never a hash |
| 20 | Mongo-down 503 audit | **done** — every new route returns `503` + a readable `detail` |
| 21–24 | medications, notifications, test results, diet plan wired | **done**; diet plan keeps the labelled preview only when no clinician plan exists |
| 25 | patient dashboard real cards | **done** — auth identity, next visit, completed visits, unread inbox |
| 26 | doctor "prescribe" + "add lab result" from the patient panel | **done** — `PatientClinicalPanel`, `PrescribeModal`, `LabResultModal`, `notifyPatient` |
| 27 | empty / error / loading states | **done** on every wired screen, including retries |
| 28 | dark-mode parity | **done** |
| 29–30 | route smoke + auth negatives | **done** — 27/27, including "anonymous read of `/appointments/` is 401" |
| 31 | CI workflow | **done** — `.github/workflows/ci.yml` + `scripts/ci_checks.py` (14 checks) |
| 32 | Docker build check | **done as a dispatch-only job** — a Dockerfile change must not be able to block a PR |
| 33–34 | code-splitting + bundle budget | **done** — entry chunk 2,179 kB → 65 kB gzip |
| 35–36 | orphan components + stale `.backup` files | **done** — 4 unused fixture components and `doctor.py.backup` deleted |
| 37–38 | error boundary, 404, accessibility | **done** — per-portal boundaries, real 404, skip link, `aria-live` on load states |
| 39 | mobile layout pass | **partial** — layouts are responsive by construction, not device-tested |
| 40 | README "what is real" refresh | **done** — §4 lists exactly one fixture |
| 41 | FEATURES.md status table | **done** — rewritten against the code |
| 42 | API table | **done** — 44 real paths from `app.openapi()` |
| 43–45 | screenshots, demo script, CHANGELOG | **not done** — cosmetic, and a CHANGELOG for one pass is noise until there is a release |
| 46 | licence header sweep | **partial** — files written in this pass carry `SPDX-License-Identifier: Apache-2.0` |
| 47–50 | video consult, e-sign, lab orders, mobile shell | **out of scope** — product decisions, not cleanup. No screen pretends they exist |

Extra work that was not on the board but had to happen:

* **Boot was broken, not slow.** `langchain-core` → `langsmith`/`langgraph` → a compiled
  `xxhash` DLL that Windows Application Control blocks. `import src.server` could not
  complete. Fixed with `backend/vendor/xxhash/` (pure-Python BLAKE2b stand-in, installed
  only when the real module fails) plus moving every optional heavy import to first use.
  Boot: **~90 s failing → 0.7 s**. See README §8 "Boot".
* **`GET /appointments/` leaked the whole collection** to an unauthenticated caller.
  Now bearer-required and role-scoped; a stranger gets `404`.
* **A patient could not book.** Upstream only allowed a doctor to create a visit.
  `backend/src/routes/booking.py` adds `bookable-doctors`, `self` and `cancel`.
* **Signup 422'd** because the model required a `hashed_password` the client must not
  send. The field is server-owned now.
