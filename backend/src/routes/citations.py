"""Citation-or-drop API.

Three endpoints, one rule: a claim is shown to a doctor only when the line it
quotes is on the page it cites.

    GET  /citations/health   what this path needs and whether it is present
    POST /citations/index    PDF  -> page text + line boxes (pdfplumber, no vectors)
    POST /citations/check    claims + pages -> verified report (no model involved)
    POST /citations/audit    PDF + question -> model offers claims, verifier keeps them

`/check` never calls a model. That is the point: you can run it with the model
switched off and it still tells the truth about a claim.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from src.config import UPLOAD_DIR
from src.services import audit_store, citations, page_index
from src.services.claim_extractor import answer_with_receipts

router = APIRouter()

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class CheckRequest(BaseModel):
    claims: List[Dict[str, Any]] = Field(default_factory=list)
    pages: Dict[str, str] = Field(default_factory=dict)
    chunks: List[Dict[str, Any]] = Field(default_factory=list)


def _save_upload(upload: UploadFile) -> Path:
    if not (upload.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="only .pdf files are accepted")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload.filename or "document.pdf").suffix or ".pdf"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=str(UPLOAD_DIR))
    size = 0
    try:
        with tmp as handle:
            while True:
                block = upload.file.read(1024 * 256)
                if not block:
                    break
                size += len(block)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="PDF is larger than 25 MB")
                handle.write(block)
    except HTTPException:
        Path(tmp.name).unlink(missing_ok=True)
        raise
    finally:
        upload.file.close()
    return Path(tmp.name)


def _index_or_400(path: Path) -> Dict[str, Any]:
    try:
        return page_index.index_pdf(path)
    except page_index.PageIndexUnavailable as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/health")
def health() -> Dict[str, Any]:
    try:
        page_index._pdfplumber()
        pdf_ok, hint = True, ""
    except page_index.PageIndexUnavailable as exc:
        pdf_ok, hint = False, str(exc)

    from src.llm import router as llm

    return {
        "pdf_reader": "pdfplumber" if pdf_ok else "missing",
        "available": pdf_ok,
        "hint": hint,
        "model": llm.model_label(),
        "provider": llm.provider(),
        "rule": "a claim survives only if its quoted line exists on the cited page",
    }


@router.post("/index")
async def index_pdf(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Page text + line boxes for one PDF. No model, no vectors, no torch."""
    path = _save_upload(file)
    try:
        data = _index_or_400(path)
    finally:
        path.unlink(missing_ok=True)
    return {
        "filename": file.filename,
        "page_count": data["page_count"],
        "char_count": data["char_count"],
        "pages": {str(k): v for k, v in data["pages"].items()},
        "chunks": data["chunks"],
    }


@router.post("/check")
def check(request: CheckRequest) -> Dict[str, Any]:
    """Verify offered claims against page text. Deterministic: no model call."""
    report = citations.verify(request.claims, request.pages, request.chunks)
    return report.to_dict()


@router.post("/audit")
async def audit(
    file: UploadFile = File(...),
    question: str = Form(""),
    max_claims: int = Form(10),
) -> Dict[str, Any]:
    """Index a PDF, let the model offer claims, then keep only what is written."""
    path = _save_upload(file)
    try:
        data = _index_or_400(path)
        text = "\n".join(
            f"[page {n}]\n{data['pages'][n]}" for n in sorted(data["pages"])
        )
        result = answer_with_receipts(
            text,
            data["pages"],
            data["chunks"],
            question=question,
            max_claims=max(1, min(int(max_claims or 10), 20)),
        )
    finally:
        path.unlink(missing_ok=True)

    result["filename"] = file.filename
    result["page_count"] = data["page_count"]
    result["audit_id"] = await audit_store.record(
        result,
        filename=file.filename or "",
        question=question,
        source="model",
    )
    return result


@router.get("/audits")
async def audits(limit: int = 20) -> Dict[str, Any]:
    """The audit trail, newest first. This is what Compass shows during judging."""
    docs = await audit_store.recent(limit)
    return {
        "count": await audit_store.count(),
        "returned": len(docs),
        "collection": audit_store.COLLECTION,
        "audits": docs,
    }
