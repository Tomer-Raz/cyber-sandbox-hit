import os
from functools import lru_cache
from pathlib import Path

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

    # Path to a service-account key file, published to the process environment
    # by `_export_google_credentials` below. Lets a machine with no gcloud and
    # no Google account authenticate to GCP, which is the only way to run this
    # locally without `gcloud auth application-default login`. Left unset on
    # Cloud Run, where the runtime service account is already the ambient
    # identity and no key file exists (or should).
    google_application_credentials: str = ""


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

    # PEM-encoded RSA private key used to sign exported reports, from Secret
    # Manager like DB_PASSWORD. Signing is pointless unless the key outlives the
    # request — a per-request key lets anyone who edits a report re-sign it — so
    # when this is unset the export is served with no signature headers at all
    # rather than a self-certifying one. See security/field_tampering.md.
    report_signing_key: str = ""

    # Opt-in rather than derived from `environment`: the deployed service runs
    # with ENVIRONMENT=dev, so keying the browsable schema off that would leave
    # /docs, /redoc and /openapi.json public in production. They list every
    # route, admin paths included, which is free reconnaissance.
    enable_api_docs: bool = False

    # Custom project-level IAM role whose members are the app's admins. Only
    # the role *name* lives in config — who holds it is read from the project
    # IAM policy at runtime (app.services.admin_directory), so no identity is
    # configured in this codebase or its deployment.
    admin_iam_role_id: str = "appAdmin"

    # Temporary guest sign-in for the project demo. Off (the default) means the
    # `guest.<mode>` bearer in app.core.deps is not accepted at all, so a
    # deployment that never sets this has no guest path. Setting it to false
    # switches guest access off again without a redeploy.
    #
    # There is no passcode by design: the SPA's guest buttons have to work on
    # the first click for a reviewer who was given nothing but a link, and a
    # code the button sends for them would be readable in the JS bundle
    # anyway. So while this is on, anyone who can reach the API can take an
    # admin session — see the block in app.core.deps. Turn it off after the
    # review.
    guest_mode_enabled: bool = False

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


def _export_google_credentials(path: str) -> None:
    """Publishes a service-account key path so google-auth can find it.

    pydantic-settings parses `.env` into the models above but never exports to
    `os.environ`, and google-auth's ADC lookup reads only `os.environ` — so a
    GOOGLE_APPLICATION_CREDENTIALS line in `.env` is inert until it is copied
    across here. Called at import, which is before any GCP client (Cloud SQL
    connector, Firestore, Vertex AI) resolves credentials, since all three
    build lazily on first use.

    A value already in the environment wins: Cloud Run's ambient identity and
    an explicit shell export both have to stay authoritative over a file that
    happens to be named in `.env`.
    """
    if not path or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        return

    # Resolved and checked here rather than left to ADC, which treats a missing
    # file as "try the next credential source" and eventually fails with an
    # error naming neither this setting nor the path — or, worse, succeeds as
    # the wrong identity. Relative paths resolve against the working directory,
    # the same place `.env` itself is read from.
    key_file = Path(path).expanduser()
    if not key_file.is_file():
        raise FileNotFoundError(
            f"GOOGLE_APPLICATION_CREDENTIALS is set to {path!r}, which is not a file. "
            "Point it at a service-account key, or unset it to use ambient credentials."
        )
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(key_file.resolve())


# Eager and safe everywhere: only requires GCP_PROJECT_ID, which both
# containers set.
shared_settings = SharedSettings()

_export_google_credentials(shared_settings.google_application_credentials)


@lru_cache
def get_settings() -> Settings:
    # Lazy and cached, not a module-level singleton — constructing this
    # eagerly would make merely importing app.core.config crash in the
    # scanner container, which never sets the API-only env vars above.
    return Settings()