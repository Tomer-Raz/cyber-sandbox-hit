import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Mirrors the caller's GCP IAM bindings, refreshed on each request and never
# written by an API call — see app.core.deps.resolve_role.
ADMIN_ROLE = "admin"
USER_ROLE = "user"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Google's `sub` claim — stable for the account's lifetime, unlike email.
    # This is the only column ever used to look up an existing user.
    google_sub: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    # Set from the ID token's `iat` rather than the wall clock, so it marks when
    # Google issued the credential, not when some later request happened to use
    # it. Comparing the two is what makes sign-in logging idempotent.
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Blocking is the one piece of user state this app owns: identity is
    # Google's and role is IAM's, but neither knows about this application.
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    blocked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    @property
    def is_blocked(self) -> bool:
        return self.blocked_at is not None
