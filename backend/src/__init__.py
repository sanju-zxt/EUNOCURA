"""EUNOCURA backend package.

The first thing this package does is make stdout/stderr UTF-8 safe. Several services
log short status lines containing non-ASCII characters; on a Windows console using
cp1252 those prints raise UnicodeEncodeError *at import time*, which would take the
whole API down before it ever starts. Reconfiguring here fixes every import path at
once (server, scripts, tests) without touching the log messages themselves.
"""

import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        # Streams can be replaced by pytest/captured buffers; not worth failing over.
        pass


def _unblock_xxhash() -> None:
    """Let the API boot when a Windows policy blocks the compiled xxhash DLL.

    `langchain-core` imports `langsmith`, which imports `xxhash`, at module load. If the
    DLL is blocked by Application Control, the server dies before `/healthz` can say
    anything. We do not use XXH3 for anything that leaves this process, so a pure-Python
    stand-in with the same call shape is enough to boot. On every normal machine the real
    package loads and this function does nothing.
    """
    try:
        import xxhash  # noqa: F401
        return
    except Exception:
        pass

    vendor = Path(__file__).resolve().parents[1] / "vendor"
    if not (vendor / "xxhash" / "__init__.py").exists():
        return
    sys.modules.pop("xxhash", None)
    sys.path.insert(0, str(vendor))
    try:
        import xxhash  # noqa: F401
    except Exception:  # pragma: no cover - the fallback itself is broken
        return


_unblock_xxhash()
