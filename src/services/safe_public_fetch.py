"""Fetch a public source with DNS-validated, IP-pinned HTTP connections.

This deliberately does not use environment proxies, cookies or client credentials.
Every redirect gets a fresh validation, and TLS verifies the original DNS name.
"""

from __future__ import annotations

import hashlib
import http.client
import ipaddress
import socket
import ssl
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import quote, urljoin, urlsplit, urlunsplit


MAX_SOURCE_BYTES = 5_000_000
MAX_REDIRECTS = 3
FETCH_SECONDS = 20


class PublicSourceError(ValueError):
    """Safe user-facing source retrieval error, never a raw network response."""


@dataclass(frozen=True)
class PublicSource:
    url: str
    content: bytes
    media_type: str
    retrieved_at: str
    sha256: str


def validate_public_url(url: str) -> tuple[str, str, int, list[str]]:
    if (
        not isinstance(url, str)
        or not url
        or len(url) > 2000
        or any(ord(c) < 33 for c in url)
    ):
        raise PublicSourceError("Angiv et gyldigt offentligt link på højst 2.000 tegn.")
    try:
        parsed = urlsplit(url)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            raise ValueError
        if (
            parsed.username is not None
            or parsed.password is not None
            or parsed.port is not None
        ):
            raise ValueError
        if "\\" in url or "%" in parsed.hostname:
            raise ValueError
        hostname = parsed.hostname.rstrip(".").encode("idna").decode("ascii").lower()
        if not hostname:
            raise ValueError
    except (ValueError, UnicodeError) as exc:
        raise PublicSourceError(
            "Brug et offentligt HTTP- eller HTTPS-link uden loginoplysninger eller portnummer."
        ) from exc
    scheme = parsed.scheme.lower()
    port = 443 if scheme == "https" else 80
    try:
        answers = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError) as exc:
        raise PublicSourceError("Hjemmesidens adresse kunne ikke slås op.") from exc
    addresses = list(dict.fromkeys(answer[4][0] for answer in answers))
    if not addresses:
        raise PublicSourceError("Hjemmesidens adresse kunne ikke slås op.")
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as exc:
            raise PublicSourceError(
                "Hjemmesidens adresse kunne ikke valideres."
            ) from exc
        if (
            not ip.is_global
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_unspecified
            or (
                isinstance(ip, ipaddress.IPv6Address)
                and (ip.ipv4_mapped or ip.sixtofour or ip.teredo)
            )
        ):
            raise PublicSourceError(
                "Linket skal pege på en offentlig hjemmeside. Lokale og private netværk er ikke tilladt."
            )
    netloc = f"[{hostname}]" if ":" in hostname else hostname
    normalized = urlunsplit((scheme, netloc, parsed.path or "/", parsed.query, ""))
    return normalized, hostname, port, addresses


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, hostname: str, port: int, address: str, timeout: float):
        super().__init__(hostname, port=port, timeout=timeout)
        self._address = address

    def connect(self) -> None:
        self.sock = socket.create_connection((self._address, self.port), self.timeout)


class _PinnedHTTPSConnection(_PinnedHTTPConnection):
    def connect(self) -> None:
        super().connect()
        self.sock = ssl.create_default_context().wrap_socket(
            self.sock, server_hostname=self.host
        )


def fetch_public_source(url: str) -> PublicSource:
    deadline = time.monotonic() + FETCH_SECONDS
    current = url
    for redirect in range(MAX_REDIRECTS + 1):
        normalized, hostname, port, addresses = validate_public_url(current)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise PublicSourceError("Hjemmesiden svarede ikke inden for tidsgrænsen.")
        parsed = urlsplit(normalized)
        connection_type = (
            _PinnedHTTPSConnection
            if parsed.scheme == "https"
            else _PinnedHTTPConnection
        )
        connection = connection_type(hostname, port, addresses[0], min(8, remaining))
        try:
            target = quote(
                urlunsplit(("", "", parsed.path, parsed.query, "")),
                safe="/%?=&;:+,@!$'()*-._~",
            )
            connection.request(
                "GET",
                target,
                headers={
                    "Accept": "text/html,application/pdf,text/plain,application/xhtml+xml",
                    "Accept-Encoding": "identity",
                    "User-Agent": "MunicipalSourceReview/1.0",
                    "Connection": "close",
                },
            )
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location or redirect == MAX_REDIRECTS:
                    raise PublicSourceError(
                        "Linket omdirigerer for mange gange eller mangler en gyldig destination."
                    )
                current = urljoin(normalized, location)
                continue
            if response.status != 200:
                raise PublicSourceError(
                    "Hjemmesiden kunne ikke hentes. Kontrollér linket, eller upload dokumentet som en fil."
                )
            if response.getheader("Content-Encoding", "identity").lower() not in {
                "",
                "identity",
            }:
                raise PublicSourceError(
                    "Hjemmesiden sendte et format, der ikke kan læses sikkert. Upload dokumentet som en fil."
                )
            length = response.getheader("Content-Length")
            if length and (not length.isdigit() or int(length) > MAX_SOURCE_BYTES):
                raise PublicSourceError("Kilden er større end grænsen på 5 MB.")
            media_type = (
                response.getheader("Content-Type", "").split(";", 1)[0].strip().lower()
            )
            if media_type not in {
                "text/html",
                "application/xhtml+xml",
                "application/pdf",
                "text/plain",
            }:
                raise PublicSourceError(
                    "Linket skal være en hjemmeside, en PDF eller en tekstfil."
                )
            content = bytearray()
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise PublicSourceError(
                        "Hjemmesiden svarede ikke inden for tidsgrænsen."
                    )
                if connection.sock is not None:
                    connection.sock.settimeout(min(8, remaining))
                chunk = response.read1(min(64_000, MAX_SOURCE_BYTES + 1 - len(content)))
                if not chunk:
                    break
                content.extend(chunk)
                if len(content) > MAX_SOURCE_BYTES:
                    raise PublicSourceError("Kilden er større end grænsen på 5 MB.")
            if not content:
                raise PublicSourceError("Hjemmesiden returnerede intet indhold.")
            if length and len(content) != int(length):
                raise PublicSourceError(
                    "Hjemmesiden blev ikke hentet fuldstændigt. Prøv igen."
                )
            raw = bytes(content)
            return PublicSource(
                normalized,
                raw,
                media_type,
                datetime.now(UTC).isoformat(),
                hashlib.sha256(raw).hexdigest(),
            )
        except PublicSourceError:
            raise
        except (OSError, ValueError, http.client.HTTPException) as exc:
            raise PublicSourceError(
                "Hjemmesiden kunne ikke hentes sikkert. Kontrollér linket, eller upload dokumentet som en fil."
            ) from exc
        finally:
            connection.close()
    raise PublicSourceError("Linket kunne ikke hentes.")
