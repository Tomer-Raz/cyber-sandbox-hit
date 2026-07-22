from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gcp_project_id: str
    gcp_region: str = "europe-west1"
    environment: str = "dev"

    db_instance_connection_name: str
    db_host: str
    db_name: str
    db_user: str
    db_password: str

    jwt_signing_key: str

    firestore_database: str = "(default)"
    artifact_registry_repo: str = "sandbox-images"
    scanner_job_name: str = "sandbox-dev-scanner"

    vertex_location: str = "europe-west1"
    vertex_model: str = "gemini-2.5-flash"

    # An empty audience would silently disable the only real check standing
    # between the API and the internet, so this has no default.
    google_oauth_client_id: str

    allowed_origins: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
