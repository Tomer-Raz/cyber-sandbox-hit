from google.cloud import firestore

from app.core.config import shared_settings

_client: firestore.AsyncClient | None = None


def get_firestore_client() -> firestore.AsyncClient:
    # Built lazily, not at import time, for the same reason as the Cloud SQL
    # connector: resolving ADC eagerly would break app import (and pytest
    # collection) before /health can even serve.
    global _client
    if _client is None:
        _client = firestore.AsyncClient(
            project=shared_settings.gcp_project_id, database=shared_settings.firestore_database
        )
    return _client
