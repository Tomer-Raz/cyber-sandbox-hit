import socket

import httpx
import pytest

from app.core import ssrf


def _addrinfo_for(*ips: str) -> list[tuple]:
    return [(socket.AF_INET, None, None, "", (ip, 0)) for ip in ips]


def _resolves_to(monkeypatch, *ips: str) -> None:
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", lambda *a, **k: _addrinfo_for(*ips))


def _resolves_per_host(monkeypatch, hosts: dict[str, list[str]]) -> None:
    """Resolves only the hosts listed; anything else raises, as DNS would."""

    def fake(host, *_a, **_k):
        if host not in hosts:
            raise socket.gaierror(f"unknown host {host}")
        return _addrinfo_for(*hosts[host])

    monkeypatch.setattr(ssrf.socket, "getaddrinfo", fake)


def _answers(routes: dict[str, httpx.Response]):
    """Builds an httpx transport serving `routes`; unlisted URLs refuse to connect."""

    def handler(request: httpx.Request) -> httpx.Response:
        key = str(request.url)
        if key not in routes:
            raise httpx.ConnectError("connection refused", request=request)
        return routes[key]

    return httpx.MockTransport(handler)


@pytest.fixture
def probe(monkeypatch):
    """Points the prober at a fake network. Returns a setter for the routes."""

    def use(routes: dict[str, httpx.Response]):
        transport = _answers(routes)
        original = httpx.AsyncClient

        def patched(**kwargs):
            return original(**{**kwargs, "transport": transport})

        monkeypatch.setattr(ssrf.httpx, "AsyncClient", patched)

    return use


pytestmark = pytest.mark.asyncio


# ── Explicit scheme: taken at face value, never probed ───────────────────────


async def test_accepts_public_address(monkeypatch):
    _resolves_to(monkeypatch, "93.184.216.34")
    assert await ssrf.validate_target_url("https://example.com") == "https://example.com"


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",  # loopback
        "169.254.169.254",  # cloud metadata
        "169.254.1.1",  # link-local
        "10.0.0.5",  # private
        "192.168.1.1",  # private
        "172.16.0.1",  # private
        "224.0.0.1",  # multicast
        "0.0.0.0",  # unspecified
    ],
)
async def test_rejects_unsafe_addresses(monkeypatch, ip):
    _resolves_to(monkeypatch, ip)
    with pytest.raises(ssrf.UnsafeTargetURLError):
        await ssrf.validate_target_url("http://evil.example")


async def test_rejects_if_any_resolved_ip_is_unsafe(monkeypatch):
    # DNS rebinding / multi-A-record defense: one safe address doesn't clear
    # a hostname that also resolves somewhere unsafe.
    _resolves_to(monkeypatch, "93.184.216.34", "127.0.0.1")
    with pytest.raises(ssrf.UnsafeTargetURLError):
        await ssrf.validate_target_url("http://mixed.example")


async def test_rejects_non_http_scheme():
    with pytest.raises(ssrf.UnsafeTargetURLError):
        await ssrf.validate_target_url("ftp://example.com")


async def test_rejects_unresolvable_hostname(monkeypatch):
    _resolves_per_host(monkeypatch, {})
    with pytest.raises(ssrf.UnsafeTargetURLError):
        await ssrf.validate_target_url("http://doesnotexist.invalid")


async def test_rejects_missing_hostname():
    with pytest.raises(ssrf.UnsafeTargetURLError):
        await ssrf.validate_target_url("http://")


async def test_rejects_empty_target():
    with pytest.raises(ssrf.UnsafeTargetURLError):
        await ssrf.validate_target_url("   ")


async def test_explicit_scheme_is_not_probed(monkeypatch, probe):
    # Nothing on the network answers; an explicitly typed URL is still accepted,
    # so registering a target never depends on it being up right now.
    _resolves_to(monkeypatch, "93.184.216.34")
    probe({})
    assert await ssrf.validate_target_url("https://down.example") == "https://down.example"


# ── Scheme-less: the working spelling is discovered, not assumed ─────────────


async def test_prefers_the_host_as_typed(monkeypatch, probe):
    _resolves_per_host(monkeypatch, {"example.com": ["93.184.216.34"]})
    probe({"https://example.com": httpx.Response(200)})
    assert await ssrf.validate_target_url("example.com") == "https://example.com"


async def test_falls_back_to_www_when_the_bare_host_does_not_answer(monkeypatch, probe):
    # e.g. a certificate that only covers the www name.
    _resolves_per_host(
        monkeypatch,
        {"example.com": ["93.184.216.34"], "www.example.com": ["93.184.216.34"]},
    )
    probe({"https://www.example.com": httpx.Response(200)})
    assert await ssrf.validate_target_url("example.com") == "https://www.example.com"


async def test_falls_back_to_http_when_no_tls_is_served(monkeypatch, probe):
    _resolves_per_host(monkeypatch, {"example.com": ["93.184.216.34"]})
    probe({"http://example.com": httpx.Response(200)})
    assert await ssrf.validate_target_url("example.com") == "http://example.com"


async def test_www_candidate_skipped_when_it_does_not_resolve(monkeypatch, probe):
    # The www sibling is a separate DNS name and often simply absent.
    _resolves_per_host(monkeypatch, {"deep.sub.example.com": ["93.184.216.34"]})
    probe({"http://deep.sub.example.com": httpx.Response(200)})
    assert await ssrf.validate_target_url("deep.sub.example.com") == "http://deep.sub.example.com"


async def test_path_port_and_query_survive_normalization(monkeypatch, probe):
    # urlparse would read "example.com" as the scheme of "example.com:8080".
    _resolves_per_host(monkeypatch, {"example.com": ["93.184.216.34"]})
    probe({"https://example.com:8080/app?a=1": httpx.Response(200)})
    assert (
        await ssrf.validate_target_url("example.com:8080/app?a=1")
        == "https://example.com:8080/app?a=1"
    )


async def test_follows_redirects_to_the_url_that_answers(monkeypatch, probe):
    _resolves_per_host(
        monkeypatch,
        {"example.com": ["93.184.216.34"], "www.example.com": ["93.184.216.34"]},
    )
    probe(
        {
            "https://example.com": httpx.Response(
                301, headers={"location": "https://www.example.com/home"}
            ),
            "https://www.example.com/home": httpx.Response(200),
        }
    )
    assert await ssrf.validate_target_url("example.com") == "https://www.example.com/home"


async def test_redirect_onto_a_private_address_is_rejected(monkeypatch, probe):
    # The whole reason redirects are walked by hand rather than by httpx.
    _resolves_per_host(
        monkeypatch,
        {"example.com": ["93.184.216.34"], "internal.example": ["10.0.0.5"]},
    )
    probe(
        {
            "https://example.com": httpx.Response(
                302, headers={"location": "https://internal.example/admin"}
            )
        }
    )
    with pytest.raises(ssrf.UnsafeTargetURLError, match="disallowed address"):
        await ssrf.validate_target_url("example.com")


async def test_unsafe_address_aborts_instead_of_trying_the_next_candidate(monkeypatch, probe):
    # A private IP must never be papered over by falling through to www/http.
    _resolves_to(monkeypatch, "127.0.0.1")
    probe({"http://example.com": httpx.Response(200)})
    with pytest.raises(ssrf.UnsafeTargetURLError, match="disallowed address"):
        await ssrf.validate_target_url("example.com")


async def test_redirect_loop_gives_up(monkeypatch, probe):
    _resolves_per_host(monkeypatch, {"example.com": ["93.184.216.34"]})
    probe(
        {
            "https://example.com": httpx.Response(302, headers={"location": "https://example.com"}),
            "http://example.com": httpx.Response(302, headers={"location": "http://example.com"}),
        }
    )
    with pytest.raises(ssrf.UnsafeTargetURLError):
        await ssrf.validate_target_url("example.com")


async def test_reports_when_nothing_answers(monkeypatch, probe):
    _resolves_per_host(monkeypatch, {"example.com": ["93.184.216.34"]})
    probe({})
    with pytest.raises(ssrf.UnsafeTargetURLError, match="Could not reach"):
        await ssrf.validate_target_url("example.com")
