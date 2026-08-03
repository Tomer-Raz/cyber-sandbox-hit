import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.scan import ScanOut


class AdminUserOut(BaseModel):
    """A user as the admin console lists them.

    Read-only by design: every field here is either minted by Google at login
    or derived from the user's own activity, so there is no counterpart
    write schema. `google_sub` is deliberately not exposed — it identifies the
    Google account and the console has no use for it.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    role: str
    created_at: datetime

    scan_count: int = 0
    last_scan_at: datetime | None = None


class AdminScanOut(ScanOut):
    """A scan row plus its owner, so the admin list can show who ran it."""

    user_id: uuid.UUID
    user_email: str
    user_name: str
