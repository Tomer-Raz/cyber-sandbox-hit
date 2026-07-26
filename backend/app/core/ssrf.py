import ipaddress
import socket
from urllib.parse import urlparse


class UnsafeTargetURLError(Exception):
    """Raised when a target URL resolves to a private, loopback, link-local,
    or cloud-metadata address. Target authorization is enforced here and
    nowhere else (requirements.md §10) — this is the only thing scoping what
    the scanner can reach, since private networking is off and there's no
    fixed egress IP to whitelist on the target side.
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


def validate_target_url(url: str) -> str:
    """Validates a target URL is http(s) and does not resolve to a private,
    loopback, link-local, or metadata address. Returns the normalized URL on
    success, raises UnsafeTargetURLError otherwise.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeTargetURLError(f"Unsupported URL scheme: {parsed.scheme!r}")

    hostname = parsed.hostname
    if not hostname:
        raise UnsafeTargetURLError("URL has no hostname")

    try:
        addrinfo = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise UnsafeTargetURLError(f"Could not resolve hostname: {hostname}") from exc

    for family, _, _, _, sockaddr in addrinfo:
        ip = ipaddress.ip_address(sockaddr[0])
        if _is_unsafe_address(ip):
            raise UnsafeTargetURLError(
                f"Target resolves to a disallowed address: {hostname} -> {ip}"
            )

    return url
