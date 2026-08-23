import json
import logging
import re
import time
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# A correlation id is echoed back to the caller and used to tie log lines
# together, so an incoming one is honoured only if it looks like an id. The
# previous code reflected the header verbatim, which meant any content and any
# length came straight back in a response header.
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


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
        # Honour a caller-supplied id so a trace spans the SPA and the API, but
        # only when it is well formed — otherwise mint one.
        incoming = request.headers.get("X-Request-ID", "")
        request_id = incoming if _SAFE_REQUEST_ID.match(incoming) else str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response