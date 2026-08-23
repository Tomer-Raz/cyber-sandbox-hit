"""Response headers that tell the browser what this API is allowed to be.

Every route here returns JSON (or, for the report export, an attachment). None
of it is a document, so the policy can be the strictest one CSP has:
`default-src 'none'`. That matters because the API answers on a public origin
of its own — paste a URL into the address bar and the browser renders whatever
comes back. If a response body ever ends up interpreted as HTML — a sniffed
content type, a stored value echoed into an error — this is the difference
between a bug and script execution on the API's origin, where the session
lives.

`frame-ancestors 'none'` and `X-Frame-Options: DENY` say the same thing to two
generations of browser; both are cheap and neither is redundant in practice.

`Cache-Control: no-store` is here rather than on each route because almost
every response is per-user: scans, targets, findings, the admin user list. The
routes set no cache headers at all today, which leaves the decision to the
browser's heuristics, and a heuristic that guesses "cacheable" writes another
user's findings onto a shared machine's disk.

Registered outermost (added last in `main.py`) so the headers are on responses
this app never routed: CORS preflights, the 413 from the body limit, and
unhandled exceptions.
"""

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Swagger UI and ReDoc are HTML that pulls its script and CSS from a CDN, so
# `default-src 'none'` would render them blank. They are off in the deployed
# service (`enable_api_docs` defaults to False), so this only ever relaxes
# anything on a developer's machine — and it relaxes CSP only, not the rest.
_DOCS_PATHS = frozenset({"/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"})

_API_CSP = (
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)

# Browsers ignore HSTS over plain http, so this is inert on localhost and only
# takes effect behind Cloud Run's TLS. No `preload`: that is a submission to a
# list baked into browsers, and it is not reversible on our timetable.
_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for name, value in _HEADERS.items():
            response.headers[name] = value
        if request.url.path not in _DOCS_PATHS:
            response.headers["Content-Security-Policy"] = _API_CSP
        # setdefault: a route that has thought about caching keeps its answer.
        response.headers.setdefault("Cache-Control", "no-store")
        return response
