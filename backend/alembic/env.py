import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import AsyncEngine

from app.db.session import Base, engine
from app.models.user import User  # noqa: F401 — registers the table with Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    # Reuses app.db.session's engine so migrations go through the Cloud SQL
    # connector too — a direct asyncpg connection to DB_HOST is refused.
    assert isinstance(engine, AsyncEngine)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


asyncio.run(run_migrations_online())
