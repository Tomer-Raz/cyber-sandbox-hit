from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class SharedSettings(BaseSettings):
    """Config every process in this codebase reads — the FastAPI service and
    the scanner Cloud Run Job both need GCP/Firestore/Vertex AI plumbing.
    Safe to instantiate from either container: unlike `Settings` below, none
    of these fields require API-only secrets the scanner job doesn't have.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project_id: str
    gcp_region: str = "europe-west1"
    environment: str = "dev"

    firestore_database: str = "(default)"

    vertex_location: str = "europe-west1"
    vertex_model: str = "gemini-2.5-flash"


class Settings(SharedSettings):
    """API-service-only config. Instantiating this requires DB creds and an
    OAuth client ID the scanner job's service account was deliberately never
    given (requirements.md §8: it "has no database or Cloud Run access") —
    so nothing importable from scanner-worker code paths (ai_service.py,
    db/firestore.py) should ever construct this. Use `shared_settings`
    there instead.
    """

    db_instance_connection_name: str
    db_host: str
    db_name: str
    db_user: str
    db_password: str

    artifact_registry_repo: str = "sandbox-images"
    scanner_job_name: str = "sandbox-dev-scanner"

    # An empty audience would silently disable the only real check standing
    # between the API and the internet, so this has no default.
    google_oauth_client_id: str

    allowed_origins: str = ""

    # Custom project-level IAM role whose members are the app's admins. Only
    # the role *name* lives in config — who holds it is read from the project
    # IAM policy at runtime (app.services.admin_directory), so no identity is
    # configured in this codebase or its deployment.
    admin_iam_role_id: str = "appAdmin"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


# Eager and safe everywhere: only requires GCP_PROJECT_ID, which both
# containers set.
shared_settings = SharedSettings()


@lru_cache
def get_settings() -> Settings:
    # Lazy and cached, not a module-level singleton — constructing this
    # eagerly would make merely importing app.core.config crash in the
    # scanner container, which never sets the API-only env vars above.
    return Settings()