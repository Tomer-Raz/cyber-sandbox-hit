import os

os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("DB_INSTANCE_CONNECTION_NAME", "test-project:europe-west1:test-instance")
os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("JWT_SIGNING_KEY", "test-signing-key")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
