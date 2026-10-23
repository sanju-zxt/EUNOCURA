"""Page index — text plus a box for every line, no embeddings.

This replaces the FAISS + torch + sentence-transformers stack for the citation
path. We do not need vectors to answer "does this line exist on page 3": we
need the page text and where each line sits, so the viewer can highlight it.

Four seconds on a cold import instead of two minutes of model download, and no
2 GB of torch in the deploy image.

Output shape is exactly what `services.citations.verify` expects:

    {"pages": {1: "page text", ...},
     "chunks": [{"page": 1, "text": "...", "coordinates": {"x0":..,"y0":..,"x1":..,"y1":..}}, ...]}

`coordinates` are PDF points, origin bottom-left as pdfplumber reports them.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

MAX_CHUNK_CHARS = 420          # small enough to fit one highlight box
LINE_Y_TOLERANCE = 3.0         # points; words closer than this are on one line
MAX_PAGES = 200

_WS = re.compile(r"\s+")


class PageIndexUnavailable(RuntimeError):
    """pdfplumber is missing or the file cannot be read as PDF."""


def _pdfplumber():
    try:
        import pdfplumber  # noqa: F401
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise PageIndexUnavailable(
            "pdfplumber is not installed: pip install pdfplumber"
        ) from exc
    return pdfplumber


def _bbox(words: List[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    if not words:
        return None
    return {
        "x0": round(min(w["x0"] for w in words), 2),
        "y0": round(min(w["top"] for w in words), 2),
        "x1": round(max(w["x1"] for w in words), 2),
        "y1": round(max(w["bottom"] for w in words), 2),
    }


def _lines(words: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Group words into visual lines by vertical position, then left to right."""
    if not words:
        return []
    rows: List[List[Dict[str, Any]]] = []
    for word in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        if rows and abs(rows[-1][0]["top"] - word["top"]) <= LINE_Y_TOLERANCE:
            rows[-1].append(word)
        else:
            rows.append([word])
    return [sorted(row, key=lambda w: w["x0"]) for row in rows]


def _line_text(row: List[Dict[str, Any]]) -> str:
    return _WS.sub(" ", " ".join(str(w.get("text", "")) for w in row)).strip()


def _page_chunks(page_no: int, words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Pack consecutive lines into chunks of at most MAX_CHUNK_CHARS."""
    chunks: List[Dict[str, Any]] = []
    pending: List[str] = []
    pending_words: List[Dict[str, Any]] = []

    def flush() -> None:
        text = " ".join(pending).strip()
        if not text:
            return
        chunks.append({"page": page_no, "text": text, "coordinates": _bbox(pending_words)})
        pending.clear()
        pending_words.clear()

    for row in _lines(words):
        text = _line_text(row)
        if not text:
            continue
        if pending and sum(len(t) + 1 for t in pending) + len(text) > MAX_CHUNK_CHARS:
            flush()
        pending.append(text)
        pending_words.extend(row)
    flush()
    return chunks


def index_pdf(path: Union[str, Path]) -> Dict[str, Any]:
    """Read a PDF once; return page text and line-anchored chunks."""
    pdfplumber = _pdfplumber()
    path = Path(path)
    if not path.exists():
        raise PageIndexUnavailable(f"no such file: {path}")

    pages: Dict[int, str] = {}
    chunks: List[Dict[str, Any]] = []

    try:
        with pdfplumber.open(str(path)) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                if i > MAX_PAGES:
                    break
                try:
                    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
                except Exception:  # a broken page must not sink the document
                    words = []
                pages[i] = _WS.sub(" ", " ".join(str(w.get("text", "")) for w in words)).strip()
                chunks.extend(_page_chunks(i, words))
    except PageIndexUnavailable:
        raise
    except Exception as exc:
        raise PageIndexUnavailable(f"could not read PDF: {exc}") from exc

    return {
        "pages": pages,
        "chunks": chunks,
        "page_count": len(pages),
        "char_count": sum(len(t) for t in pages.values()),
    }


def page_text(path: Union[str, Path]) -> Dict[int, str]:
    """Pages only, for callers that never render a highlight."""
    return index_pdf(path)["pages"]


def extract_text(path: Union[str, Path], max_chars: int = 60000) -> str:
    """Flattened text with `[page N]` markers, for prompting a model."""
    data = index_pdf(path)
    out: List[str] = []
    used = 0
    for page_no in sorted(data["pages"]):
        block = f"[page {page_no}]\n{data['pages'][page_no]}\n"
        if used + len(block) > max_chars:
            break
        out.append(block)
        used += len(block)
    return "\n".join(out)
