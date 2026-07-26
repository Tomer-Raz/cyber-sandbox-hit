import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# pending: row created, Cloud Run Job execution not started yet
# running: execution started, task container is live
# completed / failed: execution finished, terminal
# cancelled: execution was cancelled before finishing, terminal
SCAN_STATUSES = ("pending", "running", "completed", "failed", "cancelled")


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scan_configs.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    # Cloud Run Jobs execution resource name, e.g.
    # projects/P/locations/L/jobs/J/executions/E — set once the execution
    # starts, used to poll status and to cancel.
    execution_name: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
