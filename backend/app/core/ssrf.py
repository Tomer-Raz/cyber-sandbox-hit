import asyncio
import ipaddress
import re
import socket
from urllib.parse import ParseResult, urlparse, urlunparse

import httpx

# Matches a leading "scheme://". Tested against the raw string rather than
# reading urlparse().scheme, because urlparse reads the colon in a bare
# "example.com:8080" as a scheme delimiter and yields scheme="example.com".
_HAS_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://")

_WWW_PREFIX = "www."
_MAX_REDIRECTS = 5
_PROBE_TIMEOUT_SECONDS = 6.0


class UnsafeTargetURLError(Exception):
    """Raised when a target URL resolves to a private, loopback, link-local,
    or cloud-metadata address. Target authorization is enforced here and
    nowhere else (requirements.md §10) — this is the only thing scoping what
    the scanner can reach, since private networking is off and there's no
    fixed egress IP to whitelist on the target side.
    """


class _CandidateUnreachable(UnsafeTargetURLError):
    """A candidate spelling of the target didn't answer — try the next one.

    Deliberately narrower than its parent: failing to reach a host is a reason
    to try another spelling of it, whereas resolving to a private address never
    is and must abort immediately. Subclassing keeps callers' `except
    UnsafeTargetURLError` correct when every candidate has been exhausted.
    """


def _is_unsafe_address(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        # 169.254.169.254 is link-local and already covered above, but is
        # spelled out in the requirements explicitly — kept as a named check
        # so the intent survives even if link-local coverage ever changes.
        or str(ip) == "169.254.169.254"
    )


async def _resolve_safely(hostname: str) -> None:
    """Raises if `hostname` doesn't resolve, or resolves anywhere disallowed."""
    try:
        addrinfo = await asyncio.to_thread(socket.getaddrinfo, hostname, None)
    except socket.gaierror as exc:
        raise _CandidateUnreachable(f"Could not resolve hostname: {hostname}") from exc

    for *_, sockaddr in addrinfo:
        ip = ipaddress.ip_address(sockaddr[0])
        if _is_unsafe_address(ip):
            raise UnsafeTargetURLError(
                f"Target resolves to a disallowed address: {hostname} -> {ip}"
            )


def _candidate_urls(parsed: ParseResult) -> list[str]:
    """Spellings to try for a target typed without a scheme, most-preferred first.

    A host and its `www.` sibling are independent names: either one may be the
    only one with a DNS record, and a certificate commonly covers only one of
    the two. Plain http comes last for hosts that serve no TLS at all. Which
    one is right is a property of the target, so it's discovered by asking
    rather than assumed here.
    """
    netloc = parsed.netloc
    candidates = [urlunparse(parsed._replace(scheme="https"))]

    # Skipped when userinfo is present, since the host isn't the start of netloc.
    if not netloc.lower().startswith(_WWW_PREFIX) and "@" not in netloc:
        candidates.append(
            urlunparse(parsed._replace(scheme="https", netloc=f"{_WWW_PREFIX}{netloc}"))
        )

    candidates.append(urlunparse(parsed._replace(scheme="http")))
    return candidates


async def _probe(client: httpx.AsyncClient, url: str) -> str:
    """Returns the URL that finally answered, following redirects by hand.

    One hop at a time so every intermediate host goes through the same address
    checks: a public host is otherwise free to bounce the scanner onto a
    private one, which is the redirect form of the SSRF this module exists to
    stop. Only headers are read — the body of a target page is not our business.
    """
    current = url

    for _ in range(_MAX_REDIRECTS + 1):
        parsed = urlparse(current)
        if parsed.scheme not in ("http", "https"):
            raise _CandidateUnreachable(f"Unsupported redirect scheme: {parsed.scheme!r}")
        if not parsed.hostname:
            raise _CandidateUnreachable(f"Redirect target has no hostname: {current}")

        await _resolve_safely(parsed.hostname)

        try:
            async with client.stream("GET", current) as response:
                location = response.headers.get("location")
                if not (response.is_redirect and location):
                    return current
                current = str(httpx.URL(current).join(location))
        except (httpx.HTTPError, httpx.InvalidURL) as exc:
            raise _CandidateUnreachable(f"{current} did not answer: {exc}") from exc

    raise _CandidateUnreachable(f"Too many redirects from {url}")


async def validate_target_url(url: str) -> str:
    """Validates a target URL is http(s) and does not resolve to a private,
    loopback, link-local, or metadata address. Returns the URL to scan on
    success, raises UnsafeTargetURLError otherwise.
    """
    url = url.strip()
    if not url:
        raise UnsafeTargetURLError("No target URL given")

    typed_scheme = bool(_HAS_SCHEME.match(url))
    parsed = urlparse(url if typed_scheme else f"https://{url}")

    if parsed.scheme not in ("http", "https"):
        raise UnsafeTargetURLError(f"Unsupported URL scheme: {parsed.scheme!r}")
    if not parsed.hostname:
        raise UnsafeTargetURLError("URL has no hostname")

    # An explicit scheme is taken at face value: the user has said exactly what
    # they want scanned, and registering a target shouldn't require it to be up
    # this minute. It's also the escape hatch when probing picks wrong.
    if typed_scheme:
        await _resolve_safely(parsed.hostname)
        return url

    last_failure: Exception | None = None
    async with httpx.AsyncClient(
        follow_redirects=False, timeout=_PROBE_TIMEOUT_SECONDS
    ) as client:
        for candidate in _candidate_urls(parsed):
            try:
                return await _probe(client, candidate)
            except _CandidateUnreachable as exc:
                last_failure = exc

    raise UnsafeTargetURLError(
        f"Could not reach {parsed.hostname} over https or http "
        f"({last_failure}). Enter the full URL to scan it anyway."
    )
