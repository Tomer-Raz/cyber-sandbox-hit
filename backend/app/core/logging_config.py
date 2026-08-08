import json
import logging
import time
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class JSONFormatter(logging.Formatter):
    """Custom JSON log formatter compatible with GCP Cloud Logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_record = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "timestamp": self.formatTime(record, self.datefmt),
        }

        # Include request_id if attached to the log record
        if hasattr(record, "request_id"):
            log_record["request_id"] = record.request_id

        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_record)


def setup_logging():
    """Configures the root logger to output structured JSON."""
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware that attaches a unique X-Request-ID to every request/response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Use incoming X-Request-ID header if provided, otherwise generate a new UUID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response