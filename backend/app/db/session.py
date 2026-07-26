import asyncio
from collections.abc import AsyncGenerator

import asyncpg
from google.cloud.sql.connector import Connector
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

_connector: Connector | None = None


def _get_connector() -> Connector:
    # Built lazily, not at import time: resolving ADC eagerly would make the
    # whole app fail to import before it can even serve /health. Must bind to
    # the running loop explicitly — without `loop=`, the connector spins up
    # its own background loop for the key-generation/refresh Futures it
    # awaits internally, which then don't belong to the loop `connect_async`
    # runs on, raising "Future attached to a different loop" on first use.
    global _connector
    if _connector is None:
        _connector = Connector(loop=asyncio.get_running_loop())
    return _connector


async def _getconn() -> asyncpg.Connection:
    # No authorized networks and ssl_mode=ENCRYPTED_ONLY on the instance — the
    # connector is the only way in, a plain asyncpg connection is refused.
    settings = get_settings()
    return await _get_connector().connect_async(
        settings.db_instance_connection_name,
        "asyncpg",
        user=settings.db_user,
        password=settings.db_password,
        db=settings.db_name,
    )


engine = create_async_engine("postgresql+asyncpg://", async_creator=_getconn, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
