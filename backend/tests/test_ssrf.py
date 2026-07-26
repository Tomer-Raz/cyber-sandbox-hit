import socket

import pytest

from app.core import ssrf


def _addrinfo_for(*ips: str) -> list[tuple]:
    return [(socket.AF_INET, None, None, "", (ip, 0)) for ip in ips]


def test_validate_target_url_accepts_public_address(monkeypatch):
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", lambda *a, **k: _addrinfo_for("93.184.216.34"))
    assert ssrf.validate_target_url("https://example.com") == "https://example.com"


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
def test_validate_target_url_rejects_unsafe_addresses(monkeypatch, ip):
    monkeypatch.setattr(ssrf.socket, "getaddrinfo", lambda *a, **k: _addrinfo_for(ip))
    with pytest.raises(ssrf.UnsafeTargetURLError):
        ssrf.validate_target_url("http://evil.example")


def test_validate_target_url_rejects_if_any_resolved_ip_is_unsafe(monkeypatch):
    # DNS rebinding / multi-A-record defense: one safe address doesn't clear
    # a hostname that also resolves somewhere unsafe.
    monkeypatch.setattr(
        ssrf.socket, "getaddrinfo", lambda *a, **k: _addrinfo_for("93.184.216.34", "127.0.0.1")
    )
    with pytest.raises(ssrf.UnsafeTargetURLError):
        ssrf.validate_target_url("http://mixed.example")


def test_validate_target_url_rejects_non_http_scheme():
    with pytest.raises(ssrf.UnsafeTargetURLError):
        ssrf.validate_target_url("ftp://example.com")


def test_validate_target_url_rejects_unresolvable_hostname(monkeypatch):
    def raise_gaierror(*_a, **_k):
        raise socket.gaierror("nope")

    monkeypatch.setattr(ssrf.socket, "getaddrinfo", raise_gaierror)
    with pytest.raises(ssrf.UnsafeTargetURLError):
        ssrf.validate_target_url("http://doesnotexist.invalid")


def test_validate_target_url_rejects_missing_hostname():
    with pytest.raises(ssrf.UnsafeTargetURLError):
        ssrf.validate_target_url("http://")
