# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Notifications: the patient's inbox.

Deterministic CRUD, no model in the loop. Two rules shape this file:

1. A patient only ever sees their own rows. Ownership is part of the query, not a
   check after the fact, so there is no window where a foreign document is
   loaded and then rejected.
2. An unreachable Mongo answers `503` with the fix in the body. A demo that
   loses its database should say so, not 500.
"""

from __future__ import annotations

from typing import Any, Dict, List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo import ReturnDocument

from src import db as dbmod
from src.middlewares.auth import check_doctor_exists, get_current_user
from src.models.notification import NotificationCreate, build_record, serialise

router = APIRouter()

COLLECTION = "notifications"
USERS_COLLECTION = "users"

MONGO_HINT = (
    "MongoDB is unreachable. Start it (mongod --dbpath <dir>) or set MONGODB_URI "
    "in backend/.env, then retry."
)


def _collection():
    """Resolved lazily so an unreachable Mongo cannot break import time."""
    return dbmod.db.get_collection(COLLECTION)


def _unavailable(exc: Exception) -> HTTPException:
    """The one place a storage failure turns into a readable answer."""
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Notifications store unavailable. {MONGO_HINT} "
               f"({exc.__class__.__name__}: {exc})",
    )


def _id_filter(notification_id: str) -> Dict[str, Any]:
    """Match either an ObjectId or the raw string, as older rows use both."""
    try:
        return {"_id": {"$in": [ObjectId(notification_id), notification_id]}}
    except Exception:  # noqa: BLE001 - not a valid ObjectId, use the string
        return {"_id": notification_id}


def _not_found() -> HTTPException:
    # 404, not 403, for someone else's notification: a 403 confirms the id exists,
    # which is a free existence oracle over another patient's inbox.
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
    )


@router.get("/me")
async def my_notifications(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Own notifications, newest first, plus the badge number."""
    user_id = str(user["_id"])
    try:
        cursor = (
            _collection()
            .find({"user_id": user_id})
            .sort([("created_at", -1), ("_id", -1)])
            .limit(limit)
        )
        items: List[Dict[str, Any]] = [serialise(doc) async for doc in cursor]
        # Counted across the whole inbox, not the page above: the badge is an
        # inbox fact, and a page limit must never change it.
        unread = await _collection().count_documents(
            {"user_id": user_id, "read": False}
        )
        return {"items": items, "unread": unread}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - storage failure is a 503, not a 500
        print(f"  [notifications] list failed ({exc.__class__.__name__}): {exc}")
        raise _unavailable(exc)


# Both spellings are registered: a bare POST /notifications would otherwise be a
# 307 redirect, and a redirect on a write is a bug waiting for a client that does
# not replay the body.
@router.post("/", status_code=status.HTTP_201_CREATED)
@router.post("", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_notification(
    payload: NotificationCreate,
    doctor: dict = Depends(check_doctor_exists),
) -> Dict[str, Any]:
    """Doctor only. Addressed to a patient id, or to the doctor themselves."""
    target = payload.target_id() or str(doctor["_id"])
    title = payload.title.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="title cannot be blank",
        )
    try:
        record = build_record(
            user_id=target,
            title=title,
            body=payload.body,
            category=payload.category,
            link=payload.link,
        )
        # A notification written for a typo'd id is a message nobody will ever
        # read. Refuse it here instead of showing a green toast over the void.
        # No blanket except: a storage failure must surface as the 503 below,
        # not as a misleading "no such user".
        recipient = await dbmod.db.get_collection(USERS_COLLECTION).find_one(
            _id_filter(target), {"_id": 1}
        )
        if recipient is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No such user: {target}",
            )

        result = await _collection().insert_one(record)
        return serialise({**record, "_id": result.inserted_id})
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        print(f"  [notifications] create failed ({exc.__class__.__name__}): {exc}")
        raise _unavailable(exc)


@router.post("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """Mark every unread row of the caller read. Idempotent."""
    try:
        result = await _collection().update_many(
            {"user_id": str(user["_id"]), "read": False}, {"$set": {"read": True}}
        )
        return {"updated": result.modified_count}
    except Exception as exc:  # noqa: BLE001
        print(f"  [notifications] read-all failed ({exc.__class__.__name__}): {exc}")
        raise _unavailable(exc)


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str, user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Mark one owned notification read."""
    try:
        updated = await _collection().find_one_and_update(
            {**_id_filter(notification_id), "user_id": str(user["_id"])},
            {"$set": {"read": True}},
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            raise _not_found()
        return serialise(updated)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        print(f"  [notifications] read failed ({exc.__class__.__name__}): {exc}")
        raise _unavailable(exc)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str, user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Delete one owned notification. Someone else's id is indistinguishable
    from a missing one, by design."""
    try:
        result = await _collection().delete_one(
            {**_id_filter(notification_id), "user_id": str(user["_id"])}
        )
        if result.deleted_count == 0:
            raise _not_found()
        return {"deleted": True, "id": notification_id}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        print(f"  [notifications] delete failed ({exc.__class__.__name__}): {exc}")
        raise _unavailable(exc)
