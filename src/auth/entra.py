"""Microsoft Entra ID authentication and S.H.I.E.L.D. app-role enforcement.

The browser obtains an access token through authorization-code + PKCE.  This
module validates that token at the API boundary: signature, issuer, tenant,
audience, expiry, delegated scope and app roles.  The browser's interpretation
of a token is never trusted for authorization.

Local OrbStack development deliberately uses a visibly marked development
identity.  That mode is rejected when ``APP_ENV=production`` so it cannot be
mistaken for a real municipal sign-in.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable, Literal

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field


APP_ROLES = frozenset({
    "Hammeren.Sagsbehandler",
    "Hammeren.Godkender",
    "Hammeren.DPO",
    "Hammeren.Admin",
})

CASE_WORK_ROLES = frozenset({
    "Hammeren.Sagsbehandler",
    "Hammeren.Godkender",
    "Hammeren.DPO",
    "Hammeren.Admin",
})

APPROVAL_ROLES = frozenset({
    "Hammeren.Godkender",
    "Hammeren.DPO",
    "Hammeren.Admin",
})


@dataclass(frozen=True)
class AuthSettings:
    mode: Literal["development", "entra"]
    app_env: str
    tenant_id: str
    audience: str
    required_scope: str
    development_user: str
    development_roles: tuple[str, ...]

    @property
    def issuer(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant_id}/v2.0"

    @property
    def jwks_url(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant_id}/discovery/v2.0/keys"


class UserPrincipal(BaseModel):
    oid: str
    name: str
    username: str | None = None
    roles: list[str] = Field(default_factory=list)
    auth_mode: Literal["development", "entra"]
    identity_assurance: Literal["development_only", "verified_entra_token"]

    def has_any_role(self, required: set[str] | frozenset[str]) -> bool:
        return bool(set(self.roles).intersection(required))


def _parse_roles(raw: str) -> tuple[str, ...]:
    roles = tuple(item.strip() for item in raw.split(",") if item.strip())
    unknown = sorted(set(roles).difference(APP_ROLES))
    if unknown:
        raise RuntimeError("Ukendte S.H.I.E.L.D.-roller i konfigurationen: " + ", ".join(unknown))
    return roles


@lru_cache(maxsize=1)
def get_auth_settings() -> AuthSettings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    raw_mode = os.getenv("AUTH_MODE", "development").strip().lower()
    if raw_mode not in {"development", "entra"}:
        raise RuntimeError("AUTH_MODE skal være 'development' eller 'entra'")
    if app_env == "production" and raw_mode != "entra":
        raise RuntimeError("Produktion kræver AUTH_MODE=entra")

    tenant_id = os.getenv("ENTRA_TENANT_ID", "").strip()
    audience = os.getenv("ENTRA_API_AUDIENCE", "").strip()
    required_scope = os.getenv("ENTRA_REQUIRED_SCOPE", "access_as_user").strip()
    if raw_mode == "entra" and (not tenant_id or not audience or not required_scope):
        raise RuntimeError(
            "AUTH_MODE=entra kræver ENTRA_TENANT_ID, ENTRA_API_AUDIENCE og ENTRA_REQUIRED_SCOPE"
        )

    default_roles = ",".join(sorted(APP_ROLES))
    development_roles = _parse_roles(os.getenv("DEV_AUTH_ROLES", default_roles))
    return AuthSettings(
        mode=raw_mode,  # type: ignore[arg-type]
        app_env=app_env,
        tenant_id=tenant_id,
        audience=audience,
        required_scope=required_scope,
        development_user=os.getenv("DEV_AUTH_USER", "Lokal bruger").strip(),
        development_roles=development_roles,
    )


@lru_cache(maxsize=4)
def _load_jwks(jwks_url: str) -> dict:
    try:
        response = httpx.get(
            jwks_url,
            headers={"Accept": "application/json", "User-Agent": "SHIELD/1.0"},
            timeout=10.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft Entra-nøgler kunne ikke hentes.",
        ) from exc
    if not isinstance(payload.get("keys"), list):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft Entra returnerede et ugyldigt nøglesæt.",
        )
    return payload


def _verify_entra_token(token: str, settings: AuthSettings) -> UserPrincipal:
    try:
        header = jwt.get_unverified_header(token)
        key_id = header.get("kid")
        key = next(
            (item for item in _load_jwks(settings.jwks_url)["keys"] if item.get("kid") == key_id),
            None,
        )
        if key is None:
            _load_jwks.cache_clear()
            key = next(
                (item for item in _load_jwks(settings.jwks_url)["keys"] if item.get("kid") == key_id),
                None,
            )
        if key is None:
            raise JWTError("token signing key not found")
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.audience,
            issuer=settings.issuer,
            options={"verify_at_hash": False},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Adgangstokenet er ugyldigt eller udløbet.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if claims.get("tid") != settings.tenant_id:
        raise HTTPException(status_code=401, detail="Tokenet tilhører en anden Entra-tenant.")
    scopes = set(str(claims.get("scp", "")).split())
    if settings.required_scope not in scopes:
        raise HTTPException(status_code=403, detail="Tokenet mangler API-scope til S.H.I.E.L.D.")
    roles = sorted(set(claims.get("roles") or []).intersection(APP_ROLES))
    if not roles:
        raise HTTPException(status_code=403, detail="Brugeren har ingen S.H.I.E.L.D.-rolle.")

    oid = str(claims.get("oid") or "").strip()
    name = str(claims.get("name") or "").strip()
    if not oid or not name:
        raise HTTPException(status_code=401, detail="Tokenet mangler verificeret brugeridentitet.")
    return UserPrincipal(
        oid=oid,
        name=name,
        username=claims.get("preferred_username"),
        roles=roles,
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UserPrincipal:
    settings = get_auth_settings()
    if settings.mode == "development":
        return UserPrincipal(
            oid="development-local-user",
            name=settings.development_user,
            username="local@development.invalid",
            roles=list(settings.development_roles),
            auth_mode="development",
            identity_assurance="development_only",
        )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Log ind med Microsoft Entra ID.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    principal = _verify_entra_token(credentials.credentials, settings)
    request.state.user = principal
    return principal


def require_roles(*roles: str) -> Callable:
    required = frozenset(roles)
    unknown = sorted(required.difference(APP_ROLES))
    if unknown:
        raise RuntimeError("Ukendte krævede S.H.I.E.L.D.-roller: " + ", ".join(unknown))

    def dependency(user: UserPrincipal = Depends(get_current_user)) -> UserPrincipal:
        if not user.has_any_role(required):
            raise HTTPException(status_code=403, detail="Din S.H.I.E.L.D.-rolle giver ikke adgang.")
        return user

    return dependency


def authorize_case_transition(user: UserPrincipal, target_status: str) -> None:
    required = APPROVAL_ROLES if target_status in {"godkendt", "idriftsat"} else CASE_WORK_ROLES
    if not user.has_any_role(required):
        if target_status in {"godkendt", "idriftsat"}:
            detail = "Kun Godkender, DPO eller Administrator kan træffe denne beslutning."
        else:
            detail = "Din S.H.I.E.L.D.-rolle kan ikke ændre sagens status."
        raise HTTPException(status_code=403, detail=detail)
