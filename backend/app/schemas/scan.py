import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.scan import SCAN_STATUSES

_SCAN_TYPES = ("baseline", "full")


class ScanCreate(BaseModel):
    target_id: uuid.UUID
    scan_type: str = Field(default="baseline", pattern="^(" + "|".join(_SCAN_TYPES) + ")$")
    options: dict = Field(default_factory=dict)


class ScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    config_id: uuid.UUID
    status: str = Field(pattern="^(" + "|".join(SCAN_STATUSES) + ")$")
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class ScanStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
