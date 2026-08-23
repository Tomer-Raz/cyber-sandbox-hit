import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TargetCreate(BaseModel):
    # Bounded because the column is TEXT and stores the value verbatim. 2048 is
    # the practical URL ceiling browsers and proxies enforce — anything longer
    # is not a target someone typed.
    url: str = Field(min_length=1, max_length=2048)
    description: str = Field(default="", max_length=500)


class TargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    description: str
    approved: bool
    created_at: datetime
