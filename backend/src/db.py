"""MongoDB client.

Two rules learned the hard way:

1. Constructing this module must never raise. A judge with no MongoDB and no
   `.env` gets a booting server that reports `degraded` on `/healthz`, not a
   stack trace.
2. Connection is lazy (pymongo connects on first operation), so a missing
   database only breaks the routes that actually need data.
"""

import os
import re
from datetime import datetime
from typing import Any

from pymongo import AsyncMongoClient, server_api

from src.config import MONGODB_URI

# Set MONGODB_ALLOW_INVALID_CERTS=false in .env for production (default: true for development)
ALLOW_INVALID_CERTS = os.getenv("MONGODB_ALLOW_INVALID_CERTS", "true").lower() == "true"

# A local default keeps the process alive when nothing is configured. `/healthz`
# reports `mongo.configured: false` so nobody mistakes it for a working DB.
DEFAULT_URI = "mongodb://localhost:27017/eunocura"
MONGO_CONFIGURED = bool(MONGODB_URI)
URI = MONGODB_URI or DEFAULT_URI

connection_kwargs = {
    "server_api": server_api.ServerApi(version="1", strict=False, deprecation_errors=True),
    # Never let a missing database stall a request (or the demo) for 30 seconds.
    "serverSelectionTimeoutMS": 1500,
    "connectTimeoutMS": 1500,
    "socketTimeoutMS": 4000,
}

# Allow invalid certificates for development (MongoDB Atlas SSL certificate verification)
if ALLOW_INVALID_CERTS:
    connection_kwargs["tlsAllowInvalidCertificates"] = True

try:
    client = AsyncMongoClient[Any](URI, **connection_kwargs)
    db = client.get_database("InterIIIT")

    appointment_collection = db.get_collection("appointments")
    user_collection = db.get_collection("users")
    chat_history_collection = db.get_collection("chat_histories")
except Exception as exc:  # noqa: BLE001 - never block import
    print(f"WARNING: MongoDB client could not be created ({exc}). "
          "Data routes will fail; /healthz will report degraded.")


# Why the last probe failed, with any credentials stripped. A hosted deployment
# that cannot reach Atlas must be able to say *why* on /healthz: "connection
# refused" means the URI is stale, "SSL handshake" means the certificate, and
# "timed out" means the IP access list. A bare `reachable: false` tells nobody
# which of those to fix.
LAST_ERROR: str | None = None
_URI_IN_TEXT = re.compile(r"mongodb(\+srv)?://[^\s\"']+")


def _clean_error(exc: Exception) -> str:
    """A one-line reason safe to show on /healthz: no credentials, no URI."""
    text = _URI_IN_TEXT.sub("mongodb://<redacted>", str(exc))
    return " ".join(text.split())[:300]


async def ping(timeout_ms: int = 1500) -> bool:
    """True when the server answers. Used by /healthz and preflight.

    Deliberately does **not** reuse the module-level client: that one binds to the
    event loop of its first use, so a second loop (a test client, a reloaded
    worker) gets "attached to a different loop" and reports a perfectly healthy
    database as down. A short-lived probe keeps the answer true in every loop.
    """
    global LAST_ERROR
    probe = None
    try:
        probe = AsyncMongoClient[Any](URI, **connection_kwargs)
        await probe.admin.command("ping", maxTimeMS=timeout_ms)
        LAST_ERROR = None
        return True
    except Exception as exc:  # noqa: BLE001
        LAST_ERROR = _clean_error(exc)
        return False
    finally:
        if probe is not None:
            try:
                await probe.close()
            except Exception:  # noqa: BLE001
                pass


async def test_connection():
    try:
        await client.admin.command("ping")
        print("MongoDB connection successful!")
    except Exception as e:
        print(f"MongoDB connection test failed: {e}")
