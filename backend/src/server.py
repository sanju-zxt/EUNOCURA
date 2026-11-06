"""EUNOCURA API entry point.

`uvicorn src.server:app --reload --port 8000`

Boots with zero configuration: no API keys, no MongoDB, no cloud storage. Each
missing piece is reported by `/healthz` as a degraded subsystem instead of
stopping the process.
"""

import importlib.util
import os
import time as _time

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "True")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src import db
from src.config import PORT, PUBLIC_BASE_URL, STT_PROVIDER, UPLOAD_DIR
from src.llm import router
from src.r2 import storage_mode
from src.routes.citations import router as citations_router
from src.routes.root import router as root_router
from src.services import audit_store

APP_NAME = "EUNOCURA"
VERSION = "2.0.0"

app = FastAPI(title=APP_NAME, version=VERSION)


# The last three entries are the packaged app: a Capacitor webview loads the
# bundle from a synthetic https origin, so without them every fetch from the APK
# is blocked by CORS before it leaves the phone (the symptom is an app that says
# "server not connected" while /healthz is green in the browser).
_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,"
    "http://localhost:3001,http://127.0.0.1:3001,"
    "http://localhost:5173,http://127.0.0.1:5173,"
    "https://localhost,capacitor://localhost,http://localhost"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Local storage fallback: uploaded documents are served from here when R2 is
# not configured, so the PDF viewer works on a clean clone.
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(UPLOAD_DIR)), name="files")


def _has_module(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


# (monotonic timestamp, result) for the model probe in /healthz.
_MODEL_HEALTH_CACHE: tuple[float, dict | None] = (0.0, None)
_MODEL_HEALTH_TTL = 15.0


def _stt_status() -> dict:
    """Local speech only: faster-whisper if installed, else text-only."""
    try:
        from src.services import local_speech
        stt = local_speech.status()["stt"]
        tts = local_speech.status()["tts"]
    except Exception as exc:  # never let a status probe break the server
        return {
            "provider": "none",
            "available": False,
            "note": f"speech module unavailable: {exc}",
        }

    if stt["available"]:
        return {
            "provider": "faster-whisper",
            "available": True,
            "model": stt.get("model"),
            "note": "local CPU transcription - no cloud, no key",
            "tts": tts,
        }
    return {
        "provider": "none",
        "available": False,
        "note": "text-only mode - run `pip install faster-whisper` for local speech",
        "tts": tts,
    }


def _rag_status() -> dict:
    """What the optional vector stack actually loaded.

    `pdf_rag` imports faiss and its friends on first use, so this is the one
    probe that can be slow: it is always called off the event loop, under a
    timeout, and reports `available: false` with the reason when the import
    fails (a blocked DLL looks like a missing dependency to the caller).
    """
    from src.services import pdf_rag

    return pdf_rag.probe()


# A dead database must read as "try again in a minute", not as a 500 traceback.
# Every data route already handles its own case; this is the backstop for the
# ones that predate that rule (login is the one that matters: a judge cannot get
# past the door, so the door has to explain itself).
try:
    from pymongo.errors import PyMongoError
except Exception:  # pragma: no cover - pymongo is a hard dependency
    PyMongoError = None

if PyMongoError is not None:

    @app.exception_handler(PyMongoError)
    async def _mongo_unavailable(request, exc):  # noqa: ANN001, ARG001
        from fastapi.responses import JSONResponse

        reason = getattr(db, "LAST_ERROR", None) or db._clean_error(exc)
        return JSONResponse(
            status_code=503,
            content={
                "detail": "The database is unreachable, so this route cannot answer.",
                "reason": reason,
                "fix": "Start MongoDB, or set MONGODB_URI to a reachable cluster. /healthz shows the same probe.",
            },
        )


@app.get("/")
async def root():
    return {
        "service": APP_NAME,
        "version": VERSION,
        "status": "/healthz",
        "docs": "/docs",
    }


@app.get("/health")
@app.get("/healthz")
async def healthz():
    """Preflight for the live demo: what is actually operational right now.

    Every probe is capped: a demo must answer in about a second even when the
    database is unreachable and the model host is firewalled.
    """
    import asyncio as _asyncio

    async def _bounded(coro, seconds, default):
        try:
            return await _asyncio.wait_for(coro, timeout=seconds)
        except Exception:
            return default

    # The model probe asks the provider what it has installed, which is ~2.3 s
    # against a local Ollama (it lists tags) and much longer when the host is
    # firewalled. It is cached for a few seconds so a demo that polls /healthz
    # does not pay that on every hit, and bounded generously enough that a
    # healthy provider is not reported as "timed out" (a false "degraded" on the
    # projector is worse than a slightly slower first health check).
    global _MODEL_HEALTH_CACHE
    now = _time.monotonic()
    cached_at, cached_value = _MODEL_HEALTH_CACHE
    if cached_value is None or now - cached_at > _MODEL_HEALTH_TTL:
        cached_value = await _bounded(_asyncio.to_thread(router.health), 6.0, {
            "provider": "unknown", "reachable": False, "detail": "timed out",
        })
        _MODEL_HEALTH_CACHE = (now, cached_value)
    model = cached_value
    mongo_reachable = await _bounded(db.ping(), 2.0, False) if db.MONGO_CONFIGURED else False

    # Both of these import optional, slow dependencies on first call (faster-whisper
    # for STT, faiss for the vector store), so they run off the event loop under the
    # same bound as every other probe: a demo must still answer in about a second,
    # and a probe that cannot finish reports the timeout instead of hanging.
    stt = await _bounded(_asyncio.to_thread(_stt_status), 3.0, {
        "provider": "unknown",
        "available": False,
        "note": "speech probe timed out",
    })
    rag = await _bounded(_asyncio.to_thread(_rag_status), 3.0, {
        "vector_store": "unknown",
        "available": False,
        "reason": "vector store probe timed out",
        "pdf_reader": "unknown",
    })

    citations_ready = _has_module("pdfplumber")

    checks = {
        "model": model["reachable"] or model["provider"] == "none",
        "mongo": mongo_reachable,
        "storage": True,  # local disk is always writable enough to boot
        # The citation path is the demo path. A missing vector store is a
        # design decision, not a fault, so it must not drag this to "degraded".
        "citations": citations_ready,
    }
    status = "ok" if all(checks.values()) else "degraded"
    audits_recorded = await _bounded(audit_store.count(), 1.5, None)

    return {
        "service": APP_NAME,
        "version": VERSION,
        "status": status,
        "checks": checks,
        "model": model,
        "mongo": {
            "configured": db.MONGO_CONFIGURED,
            "reachable": mongo_reachable,
            "reason": getattr(db, "LAST_ERROR", None),
            "hint": "" if mongo_reachable else (
                "Set MONGODB_URI, or start a local mongod."
                if db.MONGO_CONFIGURED
                else "MONGODB_URI is not set. Portals need it; AI + document paths do not."
            ),
        },
        "storage": {
            "mode": storage_mode(),
            "dir": str(UPLOAD_DIR),
            "public_base_url": PUBLIC_BASE_URL,
            "hint": "" if storage_mode() == "r2" else "R2 not configured — files are stored locally.",
        },
        "stt": stt,
        "citations": {
            "pdf_reader": "pdfplumber" if _has_module("pdfplumber") else "missing",
            "vector_store": "not used",
            "audits_recorded": audits_recorded,
            "rule": "a claim survives only if its quoted line exists on the cited page",
        },
        "rag": {
            "role": "removed from the demo path — page text + quote matching replaced it",
            "vector_store": rag["vector_store"],
            "available": rag["available"],
            "hint": rag["reason"],
        },
    }


# All feature routers (auth, appointments, patients, doctors, ingest, chatbot).
app.include_router(root_router)

# Citation-or-drop: the evidence layer. Deterministic verification, no vectors.
app.include_router(citations_router, prefix="/citations", tags=["citations"])
