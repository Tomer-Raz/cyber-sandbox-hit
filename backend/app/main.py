from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging_config import RequestIDMiddleware, setup_logging
from app.core.rate_limit import limiter
from app.routers import admin, auth, dashboard, health, reports, scans, targets
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Initialize structured JSON logging
setup_logging()

app = FastAPI(title="Sandbox Playground API")

# Register Request-ID Middleware
app.add_middleware(RequestIDMiddleware)

# Register rate limiter instance and exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# The service is public on the internet and the ID token is the only other
# gate, so this is never "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
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