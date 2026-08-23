"""Rejects oversized request bodies before anything parses them.

Field constraints cannot do this job: Starlette reads the whole body into
memory before Pydantic sees a single field, so by the time `max_length` could
reject a value the bytes are already resident. The backend runs on 1Gi and
accepts up to 80 concurrent requests per instance (`cloud_run.tf`), so large
bodies are an out-of-memory lever rather than a validation problem.

No endpoint here takes more than a few KB — there are no uploads — so the
ceiling is generous by two orders of magnitude and still far below anything
that could hurt.

Partial by design: this reads `Content-Length`, so a chunked request that omits
it is not counted (verified — such a request reaches the route). Enforcing it
mid-stream means wrapping the ASGI receive channel, and there is no clean way
to emit a 413 once the app has begun reading. Cloud Run's fixed 32MB request
ceiling is the backstop; edge enforcement (Cloud Armor) would be the complete
fix.
"""

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

MAX_BODY_BYTES = 64 * 1024


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"detail": "Request body too large"},
            )
        return await call_next(request)
