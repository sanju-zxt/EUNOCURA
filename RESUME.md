# EUNOCURA — RESUME (authoritative state doc)

**Paused:** 2026-11-05 ~22:40 IST by user request ("save n pause, I'll get on to it tom").
**Read this first.** It supersedes older notes about this project.

---

## 0. The one thing that is still broken, and why

Production login and both portals do not work, because **there is no MongoDB in the
cloud**. `MONGODB_URI` on Vercel is a stale localhost placeholder:

```
/healthz → mongo.reachable: false
reason: "localhost:27017: [Errno 111] Connect call failed ('127.0.0.1', 27017) ..."
```

`backend/.env` locally has the same localhost URI — there is no Atlas cluster in this
project at all. Everything else in prod is green (see §2).

**To finish the deployment, someone must supply a real MongoDB Atlas URI**, then:

```powershell
# backend project link (see §4 for how to recreate .vercel\project.json)
cd C:\Users\Sanju\Projects\MedAI
Get-Content .\atlas-uri.txt | npx --yes vercel env add MONGODB_URI production --scope sanju-zxts-projects --yes
npx --yes vercel --prod --yes --scope sanju-zxts-projects      # redeploy
cd backend; .\.venv\Scripts\python.exe tools\seed_all.py        # demo accounts + clinical data
```

Then re-check `https://eunocura-backend.vercel.app/healthz` → `mongo.reachable: true`, and
log in with `demo.patient@eunocura.dev / Demo@2026`.

If no cluster exists, the 3-minute path: cloud.mongodb.com → free M0 → database user →
Network Access `0.0.0.0/0` → copy the `mongodb+srv://...` string (append `/eunocura`).
Ask the user to run it themselves; never read or print `backend/.env` contents.

---

## 1. Where everything is

| Thing | Value |
|---|---|
| Working copy | `C:\Users\Sanju\Projects\MedAI` (branch `main`, remote `git@github.com:sanju-zxt/EUNOCURA.git`) |
| Fresh clone (origin/main, read-only reference) | `C:\Users\Sanju\Projects\EUNOCURA` |
| Git state at pause | `5b7ec15` + **5 unpushed commits** + **50 tracked modified / 11 untracked** (the whole mobile pass) |
| Backend (live) | `https://eunocura-backend.vercel.app` |
| Frontend (live) | `https://eunocura-5mot.vercel.app` |
| APK (built + installed on emulator) | `frontend\android\app\build\outputs\apk\release\app-release.apk` (2,957,138 B, 2026-11-05 22:30) |
| APK to deliver | `C:\Users\Sanju\Downloads\EUNOCURA.apk` — **not copied yet** |

---

## 2. Production state at pause (verified)

`GET https://eunocura-backend.vercel.app/healthz` → **200**, `status: degraded`

```json
checks: { "model": true, "mongo": false, "storage": true, "citations": true }
model:   { "provider": "gemini", "reachable": true }
storage: { "dir": "/tmp/eunocura/uploads" }
mongo:   { "configured": true, "reachable": false, "reason": "localhost:27017 ... connection refused" }
```

Frontend bundle check (`assets/index-CeHTw5yO.js`): contains
`https://eunocura-backend.vercel.app` — the old bundle contained **zero** vercel.app
strings and three `localhost:8000`, i.e. the deployed site was pointing at the visitor's
own machine. CORS verified: request with `Origin: https://eunocura-5mot.vercel.app` gets
`Access-Control-Allow-Origin: https://eunocura-5mot.vercel.app`.

---

## 3. What was fixed this session

### Backend (prod was 500ing on every route)
| File | Change |
|---|---|
| `backend/src/services/timeseries_predictor.py` | removed unused `import numpy` → this was the original `ModuleNotFoundError: numpy` 500 |
| `backend/src/config.py` | new `_writable_dir()`: a read-only host (Vercel) cannot create `data/uploads` or `.cache/llm`, and `mkdir` at import time turned every route into a 500. Falls back to `%TEMP%\eunocura\...` and keeps serving. Applied to `UPLOAD_DIR` and `LLM_CACHE_DIR` |
| `backend/src/routes/doctor.py` | `_pdf_storage_dir()` uses the same fallback; the two hardcoded `storage/pdfs` paths now go through it |
| `backend/src/db.py` | `ping()` records a sanitised `LAST_ERROR` (`mongodb://<redacted>`) instead of swallowing the reason |
| `backend/src/server.py` | PyMongo exception handler → **503** with `detail`/`reason`/`fix` instead of a 500 traceback; `/healthz` `mongo` block now includes `reason` + a correct `hint` |

### Frontend (the app could not reach any deployed API)
| File | Change |
|---|---|
| `src/utils/api.js` | native default is now `PRODUCTION_API_BASE_URL = https://eunocura-backend.vercel.app` (was `http://10.0.2.2:8000`); the loopback env value is still ignored on device; the dead `API_BASE_URL` export now derives from the resolver |
| `src/components/patient/Chatbot.jsx` | TTS sent to a **hardcoded** `http://localhost:8000/chatbot/speak` → `getApiBaseUrl()`. This was the real `Failed to fetch` in the smoke test |
| `src/components/doctor/ChatModal.jsx` | module-level `VITE_API_BASE_URL \|\| localhost` → `getApiBaseUrl()` at both call sites |
| `src/components/doctor/ActiveSession.jsx` | diagnosis-file upload had the same hardcoded fallback → `getApiBaseUrl()` |
| `.vercelignore` (new, repo root) | `.local/`, venvs, `node_modules`, `dist`, `frontend/android/`, `work/`. Vercel uploads the **repo root**; mongod holds `.local/mongo-data` open, which killed the deploy with `EBUSY: resource busy or locked, read` |

### Test harness
`work/smoke.mjs`: added `waitFor(predicate)` (fixed sleeps were racing the lazy route
chunk — that is why "every bottom tab navigates" and "dark-mode toggle" failed) and
`$env:EUNOCURA_API_BASE` to point a run at this machine instead of prod.

---

## 4. Vercel projects and env (no secrets below, names only)

| Project | ID | Root Directory | URL |
|---|---|---|---|
| `eunocura-backend` | `prj_689zL8zgnEBxYTtz8TiiOYYjsZ7N` | `backend` | https://eunocura-backend.vercel.app |
| `eunocura-5mot` | `prj_ncfzLQSDwR5CBSiyGRUAP71tjT0L` | `frontend` | https://eunocura-5mot.vercel.app |
| `eunocura` (duplicate, broken, ignore) | — | — | https://eunocura.vercel.app |

org id `team_3O4op27j8thgBUowPfwfUNn8`. Deploy **from the repo root** — running from
`backend/` fails with `The provided path "~\Projects\MedAI\backend\backend" does not exist`
because Root Directory is already `backend`.

The root `.vercel\project.json` is deleted (it is gitignored and its presence decides
*which* project a root deploy targets). Recreate it before deploying:

```json
{ "projectId": "<id from the table>", "orgId": "team_3O4op27j8thgBUowPfwfUNn8" }
```

Env vars set on **eunocura-backend / production** this session:
* `CORS_ORIGINS` = `https://eunocura-5mot.vercel.app,https://eunocura.vercel.app,https://eunocura-backend.vercel.app,https://localhost,capacitor://localhost,http://localhost,http://localhost:5173`
* `LLM_PROVIDER` = `gemini` (was `ollama`, i.e. prod was dialling `http://localhost:11434`)

On **eunocura-5mot / production**:
* `VITE_API_BASE_URL` was **removed and re-added** as `https://eunocura-backend.vercel.app`.
  The 13-day-old secret pointed at localhost, which is why the live bundle had no API URL.

---

## 5. Verification done (all green)

| Gate | Result |
|---|---|
| `backend/scripts/ci_checks.py` | **14/14 pass**, 0 warn, 0 fail (~17 s) |
| `npm run build` (frontend) | green, 47.9 s |
| `npm run mobile:apk` | **BUILD SUCCESSFUL in 3m 8s** → `app-release.apk` 2,957,138 B |
| `adb install -r` on `zxt_api34` | Success |
| `work/smoke.mjs` on the emulator (360×800) | **14/14 checks passed** — including the 3 that used to fail (tab bar, dark mode, console errors) |
| `logcat` triage | 998 lines, **0 `Uncaught`**, 0 mixed-content, 0 `net::ERR`; the single `E/chromium` line is the benign "no wasm code cache dir" notice |
| Screenshots | `work/mobile-shots/01-launch.png`, `02-patient-dashboard.png` |

Smoke run used `$env:EUNOCURA_API_BASE=http://10.0.2.2:8000` against a **local** backend
(local mongod + `uvicorn` on :8000), because prod has no database. The shipped default is
still the deployed API.

---

## 6. Resume steps, in order

1. **Mongo** — run the block in §0, then verify `/healthz` shows `mongo.reachable: true`
   and that the deployed API accepts `demo.patient@eunocura.dev / Demo@2026`.
2. **Re-run the smoke test against prod**, not the laptop:
   `cd C:\Users\Sanju\Projects\MedAI; node work\smoke.mjs` (no `EUNOCURA_API_BASE`, so the
   app uses its deployed default). Needs the emulator + `adb forward` (§7).
3. **Screenshots for MOBILE-SPEC units 44–46** — patient screens, doctor screens, auth +
   landing + 404 (`adb exec-out screencap -p > work/mobile-shots/NN-name.png`).
4. **Tick the board** in `MOBILE-SPEC.md`: unit 08 (README §12) and units 42–50.
   Unit 42, 43, 49 are already true per §5; 44–46 need the shots; 47 is done (logcat);
   unit 50 is the APK copy below.
5. **README §12 "The Android app"** — not written yet. It must stay honest about:
   APK is a demo build signed with the debug key, `capacitor.config.ts` uses
   `androidScheme: 'http'` + `cleartext: true` + `webContentsDebuggingEnabled: true`
   (all three are wrong for a store release), and prod generation runs on Gemini while a
   local run uses Ollama.
6. **Copy the APK**: `Copy-Item frontend\android\app\build\outputs\apk\release\app-release.apk C:\Users\Sanju\Downloads\EUNOCURA.apk -Force`
7. **Commit + push** — 5 unpushed commits plus the mobile pass:
   `git fetch origin` (origin has `6d41251 Update README.md`, so the README will conflict),
   `git add -A`, commit, `git pull --rebase origin main`, resolve README by keeping the
   local §1–§11 and appending origin's change, push, then close
   issue #1 ("Evidence layer…") with the commit `58863d6` as evidence.

Optional polish, not required: bump `versionCode`/`versionName` (still `1` / `1.0.0`)
and consider `androidScheme: 'https'` now that the API is TLS (prod CORS already allows
`https://localhost`; local-HTTP overrides would need re-testing).

---

## 7. Local dev, exactly as it was running

```powershell
# 1. local database (the demo data lives in .local\mongo-data)
cd C:\Users\Sanju\Projects\MedAI
Start-Process .\.local\mongodb\bin\mongod.exe -ArgumentList '--dbpath','.\.local\mongo-data','--port','27017','--bind_ip','127.0.0.1'

# 2. backend on :8000
cd backend
Start-Process .\.venv\Scripts\python.exe -ArgumentList '-m','uvicorn','src.server:app','--host','0.0.0.0','--port','8000'

# 3. emulator (AVD zxt_api34) — 4 GB / 6 cores / host GPU
Start-Process "C:\Users\Sanju\AppData\Local\Android\Sdk\emulator\emulator.exe" -ArgumentList '-avd','zxt_api34','-no-snapshot-load','-gpu','host','-no-boot-anim'

# 4. webview devtools bridge (pid changes every launch)
$adb = "C:\Users\Sanju\AppData\Local\Android\Sdk\platform-tools\adb.exe"
& $adb shell cat /proc/net/unix | Select-String webview_devtools          # note the pid
& $adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
node work\smoke.mjs          # 14 checks
node work\audit.mjs          # layout audit
```

All three services + the emulator were **stopped** at pause, and the app-wide
`eunocura.api_base` override left in localStorage is `http://10.0.2.2:8000`
(clear it — Settings sheet → "Reset to the build default" — before judging the shipped
default, or the app will look offline on a phone).

---

## 8. Gotchas that cost time (do not re-learn these)

* Vercel uploads the **repo root**, not `backend/`. The upload was 154 MB and died with
  `EBUSY` while mongod had `.local/mongo-data` open. Fixed with `.vercelignore`.
* A Vercel bundle is **read-only**; anything that `mkdir`s at import must fall back to
  `tempfile.gettempdir()`. That bug was invisible while `backend/data/uploads` was
  committed to git.
* `vercel --prod` intermittently returns `fetch failed` / `deploy_failed`; just run the
  same command again — the second attempt succeeded every time.
* `/healthz` is the only source of truth for prod. `200 + status: degraded` is the
  intended shape when a subsystem is missing; a 500 means the bundle itself failed to
  import (read the deploy logs — `npx vercel logs <url>`).
* `npx vercel env ls --scope … --cwd backend` ignores `--cwd`; the `.vercel\project.json`
  in the current directory decides the project. That is how a "backend" env listing
  silently returned the frontend's variables.
* Emulator smoke needs the CDP port forwarded to the **current** pid's
  `webview_devtools_remote_<pid>` socket; a stale forward looks like "No page target".
