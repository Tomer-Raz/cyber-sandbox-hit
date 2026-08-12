import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.scan import ScanOut


class AdminUserOut(BaseModel):
    """A user as the admin console lists them.

    Identity here is minted by Google and role is derived from IAM, so neither
    is writable. `blocked_at` is the exception: access to *this* application is
    the one thing no upstream system knows about. `google_sub` is deliberately
    not exposed — it identifies the Google account and the console has no use
    for it.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    role: str
    created_at: datetime

    scan_count: int = 0
    last_scan_at: datetime | None = None
    last_login_at: datetime | None = None
    blocked_at: datetime | None = None


class AdminActivityEvent(BaseModel):
    """One entry from the `audit_events` collection.

    `details` carries whatever extras the call site attached (scan ids, the
    acting admin, …) rather than a fixed set of columns, so adding a new kind
    of audited action needs no schema change here.
    """

    action: str
    timestamp: datetime | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class AdminUserDetail(AdminUserOut):
    """Everything the console shows when one user is opened."""

    blocked_by_email: str | None = None
    target_count: int = 0
    first_scan_at: datetime | None = None
    activity: list[AdminActivityEvent] = Field(default_factory=list)
    sign_ins: list[AdminActivityEvent] = Field(default_factory=list)


class AdminScanOut(ScanOut):
    """A scan row plus its owner, so the admin list can show who ran it."""

    user_id: uuid.UUID
    user_email: str
    user_name: str
