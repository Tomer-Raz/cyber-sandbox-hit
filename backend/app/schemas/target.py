import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TargetCreate(BaseModel):
    url: str
    description: str = Field(default="", max_length=500)


class TargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    description: str
    approved: bool
    created_at: datetime
