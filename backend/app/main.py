from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.body_limit import BodySizeLimitMiddleware
from app.core.config import get_settings
from app.core.logging_config import RequestIDMiddleware, setup_logging
from app.routers import admin, auth, dashboard, health, reports, scans, targets

# Initialize structured JSON logging
setup_logging()

_settings = get_settings()

app = FastAPI(
    title="Sandbox Playground API",
    docs_url="/docs" if _settings.enable_api_docs else None,
    redoc_url="/redoc" if _settings.enable_api_docs else None,
    openapi_url="/openapi.json" if _settings.enable_api_docs else None,
)

# Register Request-ID Middleware
app.add_middleware(RequestIDMiddleware)

# Added after RequestIDMiddleware so it runs before it: middleware added last
# sits outermost, and an oversized body should be turned away before any other
# work happens on the request.
app.add_middleware(BodySizeLimitMiddleware)

# The service is public on the internet and the ID token is the only other
# gate, so this is never "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(targets.router)
app.include_router(scans.router)
app.include_router(reports.router)
app.include_router(dashboard.router)
app.include_router(admin.router)