# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

"""Lab result records and the reference-range rule.

`status` is derived, never accepted. A client that posts
`{"value": 3.1, "reference_high": 1.2, "status": "normal"}` gets `"high"` stored,
and the same value is re-derived on read, so a document edited by hand in Compass
cannot claim a status its own numbers contradict.

The range is inclusive: a value sitting exactly on `reference_low` or exactly on
`reference_high` is inside it. A missing or inverted range cannot classify
anything, so it reports `normal`; the reader is expected to look at
`reference_low`/`reference_high` (both null) rather than trust that badge.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Status = Literal["normal", "high", "low"]
Source = Literal["manual", "document"]


# ---------------------------------------------------------------- the rule
def derive_status(
    value: float,
    reference_low: Optional[float],
    reference_high: Optional[float],
) -> Status:
    """Classify `value` against an inclusive reference range.

    Pure and side-effect free on purpose: this is the part of a lab result that
    must not depend on what a browser sent, so it is tested directly.

    >>> derive_status(1.2, 0.6, 1.2)
    'normal'
    >>> derive_status(1.3, 0.6, 1.2)
    'high'
    """
    if reference_low is None or reference_high is None:
        return "normal"
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        return "normal"
    # An inverted range is a data-entry error, not a diagnosis. Do not guess.
    if reference_low > reference_high:
        return "normal"
    if value < reference_low:
        return "low"
    if value > reference_high:
        return "high"
    return "normal"


# ---------------------------------------------------------------- requests
class LabResultCreate(BaseModel):
    patient_id: str = Field(..., min_length=1)
    test_name: str = Field(..., min_length=1)
    value: float
    unit: Optional[str] = Field("", description="mg/dL, %, g/dL ...")
    reference_low: Optional[float] = Field(None)
    reference_high: Optional[float] = Field(None)
    taken_at: Optional[datetime] = Field(None, description="ISO-8601; defaults to now (UTC)")
    source: Source = Field("manual")
    note: Optional[str] = Field(None)
    # Accepted only so an old client does not 422. It is ignored by design; the
    # server always derives the status from the value and the range.
    status: Optional[str] = Field(None, description="Ignored — status is computed server-side")

    @field_validator("patient_id", "test_name")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("value")
    @classmethod
    def _finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("must be a finite number")
        return value

    @model_validator(mode="after")
    def _ordered_range(self) -> "LabResultCreate":
        if (
            self.reference_low is not None
            and self.reference_high is not None
            and self.reference_low > self.reference_high
        ):
            raise ValueError("reference_low must not be greater than reference_high")
        return self


# ---------------------------------------------------------------- responses
class LabResultRecord(BaseModel):
    id: str
    patient_id: str
    test_name: str
    value: float
    unit: str
    reference_low: Optional[float] = None
    reference_high: Optional[float] = None
    status: Status
    taken_at: str
    source: Source
    note: Optional[str] = None


class SeriesPoint(BaseModel):
    """One dot on a trend line. Keys are short because they repeat per point."""

    t: str
    v: float
    unit: str
    status: Status


class LabResultList(BaseModel):
    items: List[LabResultRecord] = Field(default_factory=list)
    series: Dict[str, List[SeriesPoint]] = Field(default_factory=dict)
