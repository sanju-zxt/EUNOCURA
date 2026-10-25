"""Pure-Python `xxhash` stand-in.

Why this exists
---------------
`langsmith` (a hard import of `langchain-core`) imports `xxhash` at module load, and
`langgraph` imports `xxhash.xxh3_128_hexdigest`, to derive deterministic ids. On Windows
machines where an Application Control / Smart App Control policy blocks the compiled
`_xxhash` DLL, that import kills the whole server before it can answer `/healthz` - a
hashing dependency we never asked for deciding whether the product boots.

This package is only importable when the real `xxhash` fails (see `src/__init__.py`,
which puts `backend/vendor` on `sys.path` only in that case). It mirrors the call shapes
the stack uses (`xxh3_128`, `xxh3_64`, `xxh64`, `xxh32`, the `*_hexdigest` / `*_digest`
convenience functions and the hash classes) backed by BLAKE2b. The digests are
deterministic and stable inside a process, but they are NOT XXH3 digests; nothing in
EUNOCURA or its dependencies compares them against values produced on another machine.
"""

from __future__ import annotations

import hashlib

__version__ = "0.0.0+eunocura-fallback"

__all__ = [
    "xxh32", "xxh64", "xxh3_64", "xxh3_128", "xxh128",
    "XXH32", "XXH64", "XXH3_64", "XXH3_128",
]


def _to_bytes(data) -> bytes:
    if isinstance(data, str):
        return data.encode()
    if isinstance(data, (bytes, bytearray, memoryview)):
        return bytes(data)
    return bytes(data)


class _Hash:
    """Minimal hash object exposing the parts of the xxhash API in use."""

    _size = 16

    def __init__(self, data=b"", seed: int = 0):
        self._data = _to_bytes(data)
        self._seed = seed

    def _raw(self) -> bytes:
        hasher = hashlib.blake2b(self._data, digest_size=self._size)
        if self._seed:
            hasher.update(self._seed.to_bytes(8, "little", signed=False))
        return hasher.digest()

    def digest(self) -> bytes:
        return self._raw()

    def hexdigest(self) -> str:
        return self._raw().hex()

    def intdigest(self) -> int:
        return int.from_bytes(self._raw(), "big")

    def update(self, data) -> "_Hash":
        self._data += _to_bytes(data)
        return self

    def copy(self) -> "_Hash":
        clone = type(self)(self._data, self._seed)
        return clone

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<fallback {type(self).__name__} {self.hexdigest()[:8]}>"


class XXH32(_Hash):
    _size = 4


class XXH64(_Hash):
    _size = 8


class XXH3_64(_Hash):
    _size = 8


class XXH3_128(_Hash):
    _size = 16


def xxh32(data=b"", seed: int = 0) -> XXH32:
    return XXH32(data, seed)


def xxh64(data=b"", seed: int = 0) -> XXH64:
    return XXH64(data, seed)


def xxh3_64(data=b"", seed: int = 0) -> XXH3_64:
    return XXH3_64(data, seed)


def xxh3_128(data=b"", seed: int = 0) -> XXH3_128:
    return XXH3_128(data, seed)


def xxh128(data=b"", seed: int = 0) -> XXH3_128:
    return XXH3_128(data, seed)


def _make_helpers(factory, name: str) -> None:
    globals()[f"{name}_digest"] = lambda data=b"", seed=0: factory(data, seed).digest()
    globals()[f"{name}_hexdigest"] = lambda data=b"", seed=0: factory(data, seed).hexdigest()
    globals()[f"{name}_intdigest"] = lambda data=b"", seed=0: factory(data, seed).intdigest()


for _factory, _name in (
    (xxh32, "xxh32"),
    (xxh64, "xxh64"),
    (xxh3_64, "xxh3_64"),
    (xxh3_128, "xxh3_128"),
    (xxh128, "xxh128"),
):
    _make_helpers(_factory, _name)
    __all__.extend([f"{_name}_digest", f"{_name}_hexdigest", f"{_name}_intdigest"])

del _factory, _name
